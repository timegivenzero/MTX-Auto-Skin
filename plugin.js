"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pluginmanager_js_1 = require("h1z1-server/out/servers/ZoneServer2016/managers/pluginmanager.js");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const character_js_1 = require("h1z1-server/out/servers/ZoneServer2016/entities/character.js");
const basefullcharacter_js_1 = require("h1z1-server/out/servers/ZoneServer2016/entities/basefullcharacter.js");
// ============================================================
// Data loading
// ============================================================
const CONVERSIONS_PATH = "C:/H1Z1/H1EmuServerFiles/h1z1-server-QuickStart-master/node_modules/h1z1-server/data/2016/dataSources/AcctItemConversions.json";
const ITEMS_PATH = "C:/H1Z1/H1EmuServerFiles/h1z1-server-QuickStart-master/node_modules/h1z1-server/data/2016/dataSources/ServerItemDefinitions.json";
function loadAllItems() {
    const items = JSON.parse((0, fs_1.readFileSync)(ITEMS_PATH, "utf8"));
    const result = {};
    for (const key of Object.keys(items)) {
        result[Number(key)] = items[key];
    }
    return result;
}
/** Map: "maleModelName|textureAlias" → MtxEntry */
function buildMtxMap(items) {
    const conversions = JSON.parse((0, fs_1.readFileSync)(CONVERSIONS_PATH, "utf8"));
    const map = new Map();
    for (const c of conversions) {
        const def = items[c.REWARD_ITEM_ID];
        if (!def || !def.MODEL_NAME)
            continue;
        const modelName = def.MODEL_NAME.replace("<gender>", "Male");
        const textureAlias = def.TEXTURE_ALIAS || "";
        const baseDef = items[def.PARAM2] || null;
        const key = `${modelName}|${textureAlias}`;
        if (!map.has(key)) {
            map.set(key, {
                accountItemId: c.ACCOUNT_ITEM_ID,
                rewardItemId: c.REWARD_ITEM_ID,
                baseModelName: baseDef?.MODEL_NAME?.replace("<gender>", "Male") || "",
                baseTextureAlias: baseDef?.TEXTURE_ALIAS || "",
                baseItemDefId: def.PARAM2 || 0
            });
        }
    }
    return map;
}
function findItemNames(items) {
    const names = {};
    for (const [idStr, def] of Object.entries(items)) {
        names[Number(idStr)] = def.NAME || "";
    }
    return names;
}
// ============================================================
// Plugin
// ============================================================
class ServerPlugin extends pluginmanager_js_1.BasePlugin {
    constructor() {
        super(...arguments);
        this.name = "skin-saver";
        this.description = "Save and apply MTX skins per character";
        this.author = "";
        this.version = "4.1.0";
        this.savedSkins = {};
        this.hooked = false;
        // ----------------------------------------------------------
        // Commands
        // ----------------------------------------------------------
        this.commands = [
            {
                name: "saveskin",
                description: "Save your current equipment appearance as a skin",
                permissionLevel: 0,
                execute: async (server, client, _args) => {
                    const charName = this.getCharName(client);
                    const rawSkin = this.captureEquipment(client);
                    const slotCount = Object.keys(rawSkin).length;
                    if (slotCount === 0) {
                        server.sendAlert(client, "No equipment to save!");
                        return;
                    }
                    const validatedSkin = await this.validateSkinOwnership(server, client, rawSkin);
                    const keptSlots = Object.keys(validatedSkin).length;
                    this.savedSkins[charName] = validatedSkin;
                    this.saveSkinForCharacter(charName);
                    const rejected = slotCount - keptSlots;
                    if (rejected > 0) {
                        server.sendAlert(client, `Skin saved for "${charName}"! ${keptSlots} slots kept, ${rejected} reset to default.`);
                    }
                    else {
                        server.sendAlert(client, `Skin saved for "${charName}"! (${slotCount} slots)`);
                    }
                }
            },
            {
                name: "clearskin",
                description: "Clear saved skin",
                permissionLevel: 0,
                execute: (server, client, _args) => {
                    const charName = this.getCharName(client);
                    this.deleteSkinForCharacter(charName);
                    server.sendAlert(client, `Skin cleared for "${charName}". Equipment will use defaults now.`);
                }
            },
            {
                name: "loadskin",
                description: "Re-apply saved skin immediately",
                permissionLevel: 0,
                execute: (server, client, _args) => {
                    const charName = this.getCharName(client);
                    const skin = this.savedSkins[charName];
                    if (!skin) {
                        server.sendAlert(client, `No saved skin found for "${charName}". Use /saveskin first.`);
                        return;
                    }
                    this.applyEquipment(client, skin);
                    this.sendFullAppearance(client, server);
                    server.sendAlert(client, `Skin applied for "${charName}"!`);
                }
            }
        ];
    }
    loadConfig(_config) {
        // no runtime config
    }
    async init(server) {
        this.allItems = loadAllItems();
        this.mtxMap = buildMtxMap(this.allItems);
        this.itemNames = findItemNames(this.allItems);
        console.log(`[SkinPlugin] ${this.mtxMap.size} MTX skin mappings loaded`);
        this.loadPersistedSkins();
        this.hookAppearance(server);
    }
    // ----------------------------------------------------------
    // Persistence
    // ----------------------------------------------------------
    get skinsDir() {
        return path_1.default.join(this.dir, "data", "skins");
    }
    loadPersistedSkins() {
        const dir = this.skinsDir;
        if (!(0, fs_1.existsSync)(dir)) {
            (0, fs_1.mkdirSync)(dir, { recursive: true });
            return;
        }
        try {
            const files = (0, fs_1.readdirSync)(dir);
            for (const file of files) {
                if (!file.endsWith(".json"))
                    continue;
                const charName = file.slice(0, -5);
                const filePath = path_1.default.join(dir, file);
                this.savedSkins[charName] = JSON.parse((0, fs_1.readFileSync)(filePath, "utf8"));
            }
            console.log(`[SkinPlugin] Loaded ${Object.keys(this.savedSkins).length} saved character skin file(s)`);
        }
        catch (e) {
            console.error("[SkinPlugin] Failed to load skins:", e);
        }
    }
    saveSkinForCharacter(charName) {
        const dir = this.skinsDir;
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        const filePath = path_1.default.join(dir, `${charName}.json`);
        if (this.savedSkins[charName]) {
            (0, fs_1.writeFileSync)(filePath, JSON.stringify(this.savedSkins[charName], null, 2));
        }
    }
    deleteSkinForCharacter(charName) {
        const filePath = path_1.default.join(this.skinsDir, `${charName}.json`);
        if ((0, fs_1.existsSync)(filePath))
            (0, fs_1.unlinkSync)(filePath);
        delete this.savedSkins[charName];
    }
    getCharName(client) {
        return client.character?.name || client.loginSessionId;
    }
    // ----------------------------------------------------------
    // Appearance hooks (handles respawn + equip + render)
    // ----------------------------------------------------------
    hookAppearance(server) {
        if (this.hooked)
            return;
        this.hooked = true;
        const plugin = this;
        // Primary hook: Character2016.pGetAttachmentSlot
        // This intercepts appearance serialization for players (login, respawn, equipment changes)
        const Char = character_js_1.Character2016.prototype;
        const origGetAttSlot = Char.pGetAttachmentSlot;
        Char.pGetAttachmentSlot = function (slotId) {
            const result = origGetAttSlot.call(this, slotId);
            // Only apply skins to player characters (not NPCs/vehicles)
            const client = server.getClientByCharId(this.characterId);
            if (!client)
                return result;
            const charName = plugin.getCharName(client);
            const skin = plugin.savedSkins[charName];
            if (!skin || !skin[slotId])
                return result;
            const savedSlot = skin[slotId];
            // Apply appearance overrides
            if (savedSlot.modelName)
                result.modelName = savedSlot.modelName;
            if (savedSlot.textureAlias)
                result.textureAlias = savedSlot.textureAlias;
            if (savedSlot.effectId)
                result.effectId = savedSlot.effectId;
            if (savedSlot.tintAlias)
                result.tintAlias = savedSlot.tintAlias;
            if (savedSlot.decalAlias && savedSlot.decalAlias !== "#")
                result.decalAlias = savedSlot.decalAlias;
            console.log(`[SkinPlugin] pGetAttachmentSlot slot=${slotId} char=${charName} model=${savedSlot.modelName} tx=${savedSlot.textureAlias}`);
            return result;
        };
        // Secondary hook: BaseFullCharacter.equipItem
        // This modifies the raw _equipment data so updateEquipmentSlot broadcasts the correct appearance
        const Bfc = basefullcharacter_js_1.BaseFullCharacter.prototype;
        const origEquipItem = Bfc.equipItem;
        Bfc.equipItem = function (srv, item, sendPacket = true, loadoutSlotId = 0) {
            const result = origEquipItem.call(this, srv, item, sendPacket, loadoutSlotId);
            const char = this;
            if (!char?.characterId)
                return result;
            const client = srv.getClientByCharId(char.characterId);
            if (!client || !client.character?._equipment)
                return result;
            // Apply saved skin to the newly equipped equipment slot
            const equipmentData = char._equipment;
            for (const [slotIdStr, target] of Object.entries(plugin.savedSkins[plugin.getCharName(client)] || {})) {
                const slotId = Number(slotIdStr);
                const existing = equipmentData[slotId];
                if (!existing)
                    continue;
                // Validate: saved model must be compatible with this slot
                const itemDef = plugin.allItems[existing.modelName ? plugin.findItemDefForModel?.call(plugin, existing.modelName) || 0 : 0];
                existing.modelName = target.modelName;
                existing.textureAlias = target.textureAlias;
                existing.effectId = target.effectId;
                existing.tintAlias = target.tintAlias;
                existing.decalAlias = target.decalAlias;
            }
            return result;
        };
    }
    findItemDefForModel(modelName) {
        for (const [idStr, def] of Object.entries(this.allItems)) {
            const m = (def.MODEL_NAME || "").replace("<gender>", "Male");
            if (m === modelName)
                return Number(idStr);
        }
        return 0;
    }
    // ----------------------------------------------------------
    // Skin capture & apply (manual commands)
    // ----------------------------------------------------------
    captureEquipment(client) {
        const skin = {};
        const equipment = client.character._equipment || {};
        for (const [slotId, slot] of Object.entries(equipment)) {
            const s = slot;
            if (s.modelName) {
                skin[slotId] = {
                    modelName: s.modelName,
                    textureAlias: s.textureAlias || "",
                    effectId: s.effectId ?? 0,
                    tintAlias: s.tintAlias || "",
                    decalAlias: s.decalAlias || "#",
                    shaderParamGroup: Array.isArray(s.SHADER_PARAMETER_GROUP) ? [...s.SHADER_PARAMETER_GROUP] : []
                };
            }
        }
        return skin;
    }
    applyEquipment(client, skin) {
        const equipment = client.character._equipment || {};
        for (const [slotIdStr, target] of Object.entries(skin)) {
            const slotId = Number(slotIdStr);
            const existing = equipment[slotId];
            if (!existing)
                continue;
            existing.modelName = target.modelName;
            existing.textureAlias = target.textureAlias;
            existing.effectId = target.effectId;
            existing.tintAlias = target.tintAlias;
            existing.decalAlias = target.decalAlias;
            existing.SHADER_PARAMETER_GROUP = target.shaderParamGroup;
        }
    }
    sendFullAppearance(client, server) {
        server.sendDataToAllWithSpawnedEntity(server._characters, client.character.characterId, "Equipment.SetCharacterEquipment", client.character.pGetEquipment());
    }
    // ----------------------------------------------------------
    // Ownership validation
    // ----------------------------------------------------------
    async validateSkinOwnership(server, client, skin) {
        const validated = {};
        const charName = this.getCharName(client);
        // Get player's owned account items
        let ownedAccountItems;
        try {
            const raw = await server.accountInventoriesManager.getAccountItems(client.loginSessionId);
            ownedAccountItems = new Set(raw.map((item) => item.itemDefinitionId));
        }
        catch {
            console.log("[SkinPlugin] Could not fetch account inventory for", charName, ", defaulting all slots");
            return {};
        }
        // Get player's loadout itemDefinitionIds to determine what items they actually have
        const loadoutItemIds = new Set();
        for (const slot of Object.values(client.character._loadout || {})) {
            const loadoutSlot = slot;
            if (loadoutSlot.itemDefinitionId) {
                loadoutItemIds.add(loadoutSlot.itemDefinitionId);
            }
        }
        for (const [slotId, slot] of Object.entries(skin)) {
            const modelName = slot.modelName;
            const textureAlias = slot.textureAlias;
            const key = `${modelName}|${textureAlias}`;
            const mtxEntry = this.mtxMap.get(key);
            if (mtxEntry) {
                // This is an MTX skin — check ownership
                if (ownedAccountItems.has(mtxEntry.accountItemId)) {
                    validated[slotId] = { ...slot };
                }
                else {
                    // Unowned MTX — reset to base item default
                    const itemName = this.itemNames[mtxEntry.rewardItemId] || `#${mtxEntry.rewardItemId}`;
                    console.log(`[SkinPlugin] ${charName} tried to save unowned MTX "${itemName}" (acct#${mtxEntry.accountItemId}) in slot ${slotId} — resetting to default`);
                    if (mtxEntry.baseModelName) {
                        validated[slotId] = {
                            modelName: mtxEntry.baseModelName,
                            textureAlias: mtxEntry.baseTextureAlias,
                            effectId: 0,
                            tintAlias: "",
                            decalAlias: "#",
                            shaderParamGroup: []
                        };
                    }
                }
                continue;
            }
            // Not an MTX skin — validate against what the player actually has in their loadout
            let validDefault = true;
            if (loadoutItemIds.size > 0) {
                let foundMatch = false;
                for (const loadoutDefId of loadoutItemIds) {
                    const loadoutDef = this.allItems[loadoutDefId];
                    if (!loadoutDef || !loadoutDef.MODEL_NAME)
                        continue;
                    const loadoutModel = loadoutDef.MODEL_NAME.replace("<gender>", "Male");
                    const slotNum = Number(slotId);
                    const passiveSlot = loadoutDef.PASSIVE_EQUIP_SLOT_ID || 0;
                    const activeSlot = loadoutDef.ACTIVE_EQUIP_SLOT_ID || 0;
                    if ((passiveSlot === slotNum || activeSlot === slotNum) && loadoutModel === modelName) {
                        foundMatch = true;
                        break;
                    }
                }
                if (!foundMatch && modelName !== "Weapon_Empty.adr") {
                    // The model doesn't match any loadout item for this slot — reset to default
                    const slotDefaults = {
                        3: "SurvivorMale_Chest_Shirt_PoloLongSleeve.adr",
                        4: "SurvivorMale_Legs_Pants_StraightLeg.adr",
                        5: "SurvivorMale_Feet_Workboots.adr",
                        7: "Weapon_Empty.adr"
                    };
                    console.log(`[SkinPlugin] ${charName} slot ${slotId} has unrecognized model "${modelName}" — resetting to default`);
                    const slotNum = Number(slotId);
                    const defaultModel = slotDefaults[slotNum] || modelName;
                    validated[slotId] = {
                        modelName: defaultModel,
                        textureAlias: "",
                        effectId: 0,
                        tintAlias: "",
                        decalAlias: "#",
                        shaderParamGroup: []
                    };
                    validDefault = false;
                }
            }
            if (validDefault) {
                validated[slotId] = { ...slot };
            }
        }
        return validated;
    }
}
exports.default = ServerPlugin;
