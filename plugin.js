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
const ITEMS_PATH       = "C:/H1Z1/H1EmuServerFiles/h1z1-server-QuickStart-master/node_modules/h1z1-server/data/2016/dataSources/ServerItemDefinitions.json";

/** Set to false to silence verbose equip debugging */
const SKIN_DEBUG_EQUIP = true;

function skinEquipDebug(...args) {
    if (SKIN_DEBUG_EQUIP) console.log("[SkinPlugin][equip]", ...args);
}

function loadAllItems() {
    const raw = JSON.parse((0, fs_1.readFileSync)(ITEMS_PATH, "utf8"));
    const result = {};
    for (const key of Object.keys(raw)) result[Number(key)] = raw[key];
    return result;
}

/** Map: "maleModelName|textureAlias" → { accountItemId, rewardItemId, baseModelName, baseTextureAlias, baseItemDefId } */
function buildMtxMap(items) {
    const conversions = JSON.parse((0, fs_1.readFileSync)(CONVERSIONS_PATH, "utf8"));
    const map = new Map();
    for (const c of conversions) {
        const def = items[c.REWARD_ITEM_ID];
        if (!def || !def.MODEL_NAME) continue;
        const modelName    = def.MODEL_NAME.replace("<gender>", "Male");
        const textureAlias = def.TEXTURE_ALIAS || "";
        const baseDef      = items[def.PARAM2] || null;
        const key          = `${modelName}|${textureAlias}`;
        if (!map.has(key)) {
            map.set(key, {
                accountItemId:    c.ACCOUNT_ITEM_ID,
                rewardItemId:     c.REWARD_ITEM_ID,
                baseModelName:    baseDef?.MODEL_NAME?.replace("<gender>", "Male") || "",
                baseTextureAlias: baseDef?.TEXTURE_ALIAS || "",
                baseItemDefId:    def.PARAM2 || 0
            });
        }
    }
    return map;
}

/** Map: rewardItemId → { accountItemId, baseItemDefId } — for direct defId ownership checks */
function buildMtxRewardMap(items) {
    const conversions = JSON.parse((0, fs_1.readFileSync)(CONVERSIONS_PATH, "utf8"));
    const map = new Map();
    for (const c of conversions) {
        const def = items[c.REWARD_ITEM_ID];
        if (!def) continue;
        if (!map.has(c.REWARD_ITEM_ID)) {
            map.set(c.REWARD_ITEM_ID, {
                accountItemId: c.ACCOUNT_ITEM_ID,
                baseItemDefId: def.PARAM2 || 0
            });
        }
    }
    return map;
}

function buildItemNames(items) {
    const names = {};
    for (const [idStr, def] of Object.entries(items)) names[Number(idStr)] = def.NAME || "";
    return names;
}

// ============================================================
// Plugin
// ============================================================
class ServerPlugin extends pluginmanager_js_1.BasePlugin {
    constructor() {
        super(...arguments);
        this.name        = "skin-saver";
        this.description = "Save and apply MTX skins per character";
        this.author      = "";
        this.version     = "5.0.0";
        this.savedSkins  = {};
        this.hooked      = false;

        // ----------------------------------------------------------
        // Commands  (names unchanged)
        // ----------------------------------------------------------
        this.commands = [
            {
                name: "saveskin",
                description: "Save your current equipment appearance as a skin",
                permissionLevel: 0,
                execute: async (server, client, _args) => {
                    const charName  = this.getCharName(client);
                    const rawSkin   = this.captureEquipment(client, server);
                    const slotCount = Object.keys(rawSkin).length;
                    if (slotCount === 0) {
                        server.sendAlert(client, "No equipment to save!");
                        return;
                    }
                    const validatedSkin = await this.validateSkinOwnership(server, client, rawSkin);
                    const keptSlots     = Object.keys(validatedSkin).length;
                    this.savedSkins[charName] = validatedSkin;
                    this.saveSkinForCharacter(charName);
                    const rejected = slotCount - keptSlots;
                    if (rejected > 0)
                        server.sendAlert(client, `Skin saved for "${charName}"! ${keptSlots} slots kept, ${rejected} reset to default.`);
                    else
                        server.sendAlert(client, `Skin saved for "${charName}"! (${slotCount} slots)`);
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
                    const skin     = this.savedSkins[charName];
                    if (!skin) {
                        server.sendAlert(client, `No saved skin found for "${charName}". Use /saveskin first.`);
                        return;
                    }
                    this.applyAllSkins(server, client, skin);
                    server.sendAlert(client, `Skin applied for "${charName}"!`);
                }
            }
        ];
    }

    loadConfig(_config) {}

    async init(server) {
        this.allItems     = loadAllItems();
        this.mtxMap       = buildMtxMap(this.allItems);
        this.mtxRewardMap = buildMtxRewardMap(this.allItems);
        this.itemNames    = buildItemNames(this.allItems);
        console.log(`[SkinPlugin] ${this.mtxMap.size} MTX skin mappings loaded`);
        this.loadPersistedSkins();
        this.hookProto(server);
        this.hookRespawn(server);
        if (SKIN_DEBUG_EQUIP) {
            console.log("[SkinPlugin][equip] Debug logging ON (SKIN_DEBUG_EQUIP=true). Toggle in plugin.js.");
        }
    }

    // ----------------------------------------------------------
    // Persistence
    // ----------------------------------------------------------
    get skinsDir() { return path_1.default.join(this.dir, "data", "skins"); }

    loadPersistedSkins() {
        const dir = this.skinsDir;
        if (!(0, fs_1.existsSync)(dir)) { (0, fs_1.mkdirSync)(dir, { recursive: true }); return; }
        try {
            for (const file of (0, fs_1.readdirSync)(dir)) {
                if (!file.endsWith(".json")) continue;
                const charName = file.slice(0, -5);
                this.savedSkins[charName] = JSON.parse((0, fs_1.readFileSync)(path_1.default.join(dir, file), "utf8"));
            }
            console.log(`[SkinPlugin] Loaded ${Object.keys(this.savedSkins).length} saved skin file(s)`);
        } catch (e) { console.error("[SkinPlugin] Failed to load skins:", e); }
    }

    saveSkinForCharacter(charName) {
        const dir = this.skinsDir;
        if (!(0, fs_1.existsSync)(dir)) (0, fs_1.mkdirSync)(dir, { recursive: true });
        if (this.savedSkins[charName])
            (0, fs_1.writeFileSync)(path_1.default.join(dir, `${charName}.json`), JSON.stringify(this.savedSkins[charName], null, 2));
    }

    deleteSkinForCharacter(charName) {
        const fp = path_1.default.join(this.skinsDir, `${charName}.json`);
        if ((0, fs_1.existsSync)(fp)) (0, fs_1.unlinkSync)(fp);
        delete this.savedSkins[charName];
    }

    getCharName(client) { return client.character?.name || client.loginSessionId; }

    /**
     * After an item is placed in loadout (pickup auto-equip, drag to slot, equipItem, etc.),
     * replace it with the saved MTX skin for that equipment slot when applicable.
     * Safe to call from multiple hooks; patchSlot no-ops if already skinned.
     */
    tryApplySkinToEquippedItem(server, character, item, loadoutSlotId, dbg) {
        const log = typeof dbg === "function" ? dbg : () => {};
        try {
            if (!this._origEquipItem || !character?.characterId || !item?.itemGuid) return;
            const client = server.getClientByCharId(character.characterId);
            if (!client) return;
            const charName = this.getCharName(client);
            const skin     = this.savedSkins[charName];
            if (!skin) return;

            const resolvedLoadoutSlot = this.resolveLoadoutSlot(character, item.itemGuid, loadoutSlotId, log);
            if (!resolvedLoadoutSlot) return;

            const target = this.findSkinTarget(character, skin, resolvedLoadoutSlot, log, server);
            if (!target) return;

            const equipSlot = this.equipSlotForLoadoutSlot(character, resolvedLoadoutSlot, server);
            log("tryApplySkinToEquippedItem: patchSlot", {
                loadoutSlot: resolvedLoadoutSlot,
                equipSlot,
                itemDef: item.itemDefinitionId
            });
            this.patchSlot(server, client, equipSlot, resolvedLoadoutSlot, target);
            this.pushLoadoutPacket(server, client);
            character.updateEquipment(server);
        } catch (e) {
            console.error("[SkinPlugin] tryApplySkinToEquippedItem:", e);
        }
    }

    // ----------------------------------------------------------
    // Prototype hooks
    // ----------------------------------------------------------
    hookProto(server) {
        if (this.hooked) return;
        this.hooked = true;
        const plugin = this;

        // ---- Visual hook: overrides the appearance packet so other players
        //      (and the player themselves) see the saved skin model/texture.
        const Char = character_js_1.Character2016.prototype;
        const origGetAttSlot = Char.pGetAttachmentSlot;
        Char.pGetAttachmentSlot = function (slotId) {
            const result = origGetAttSlot.call(this, slotId);
            const client = server.getClientByCharId(this.characterId);
            if (!client) return result;
            const skin = plugin.savedSkins[plugin.getCharName(client)];
            if (!skin || !skin[slotId]) return result;
            const s = skin[slotId];
            if (s.modelName)    result.modelName    = s.modelName;
            if (s.textureAlias) result.textureAlias = s.textureAlias;
            if (s.effectId)     result.effectId     = s.effectId;
            if (s.tintAlias)    result.tintAlias    = s.tintAlias;
            if (s.decalAlias && s.decalAlias !== "#") result.decalAlias = s.decalAlias;
            return result;
        };

        // ---- Equip / loot hooks on the SAME BaseFullCharacter.prototype that
        //      Character2016 (and other entities) actually inherit.
        //      A direct require(".../basefullcharacter.js") can resolve to a *different*
        //      physical module than character.js imports; patching that copy would make
        //      respawn (which uses _origEquipItem.call) work while normal equipItem()
        //      on players stayed unhooked — no logs, no pickup skinning.
        const CharCtor     = character_js_1.Character2016;
        const Bfc          = Object.getPrototypeOf(CharCtor.prototype);
        const directBfcProto = basefullcharacter_js_1.BaseFullCharacter.prototype;
        if (Bfc !== directBfcProto) {
            console.warn(
                "[SkinPlugin] BaseFullCharacter.prototype mismatch: equip/loot hooks are applied to Character2016's parent prototype (correct for runtime). Direct require() pointed at a duplicate module."
            );
        } else if (SKIN_DEBUG_EQUIP) {
            skinEquipDebug("BaseFullCharacter.prototype matches direct require (single h1z1-server copy).");
        }

        const origLootItem = Bfc.lootItem;
        Bfc.lootItem = function (server, item, count, sendUpdate) {
            const r = origLootItem.call(this, server, item, count, sendUpdate);
            // World pickup / rewards use lootItem → equipItem; this also covers any edge case
            // where equipItem wasn’t hooked. Second call is cheap if already skinned.
            if (item?.itemGuid) {
                plugin.tryApplySkinToEquippedItem(
                    server,
                    this,
                    item,
                    0,
                    SKIN_DEBUG_EQUIP ? skinEquipDebug : null
                );
            }
            return r;
        };

        const origEquipContainerItem = Bfc.equipContainerItem;
        Bfc.equipContainerItem = function (server, item, slotId, sourceCharacter) {
            const r = origEquipContainerItem.call(this, server, item, slotId, sourceCharacter);
            // Drag from inventory / bag into a loadout slot
            if (item?.itemGuid) {
                plugin.tryApplySkinToEquippedItem(
                    server,
                    this,
                    item,
                    slotId,
                    SKIN_DEBUG_EQUIP ? skinEquipDebug : null
                );
            }
            return r;
        };

        // ---- Equip hook: fires every time ANY item is equipped into the loadout.
        const origEquipItem = Bfc.equipItem;
        // Store so patchSlot can call it directly without re-triggering this hook.
        plugin._origEquipItem = origEquipItem;

        Bfc.equipItem = function (srv, item, sendPacket = true, loadoutSlotId = 0) {
            if (SKIN_DEBUG_EQUIP) {
                skinEquipDebug(">>> equipItem ENTER", {
                    characterId: this?.characterId,
                    itemGuid: item?.itemGuid,
                    itemDefId: item?.itemDefinitionId,
                    loadoutSlotIdArg: loadoutSlotId,
                    sendPacket
                });
            }

            const result = origEquipItem.call(this, srv, item, sendPacket, loadoutSlotId);

            try {
                if (!this?.characterId) {
                    if (SKIN_DEBUG_EQUIP) skinEquipDebug("SKIP equip: no characterId");
                    return result;
                }
                if (!srv.getClientByCharId(this.characterId)) {
                    if (SKIN_DEBUG_EQUIP) skinEquipDebug("SKIP equip: no client");
                    return result;
                }
                plugin.tryApplySkinToEquippedItem(
                    srv,
                    this,
                    item,
                    loadoutSlotId,
                    SKIN_DEBUG_EQUIP ? skinEquipDebug : null
                );
                if (SKIN_DEBUG_EQUIP) skinEquipDebug("<<< equipItem hook done");
            } catch (e) {
                console.error("[SkinPlugin] equipItem hook error:", e);
            }
            return result;
        };
    }

    // ----------------------------------------------------------
    // Respawn hook
    // ----------------------------------------------------------
    hookRespawn(server) {
        const plugin = this;
        server.hookManager.hook("OnPlayerRespawned", (client) => {
            const skin = plugin.savedSkins[plugin.getCharName(client)];
            if (!skin) return;
            console.log(`[SkinPlugin] Applying skin for ${plugin.getCharName(client)} on respawn`);
            // Small defer so the server finishes sending its own loadout packets first.
            setTimeout(() => {
                try { plugin.applyAllSkins(server, client, skin); }
                catch (e) { console.error("[SkinPlugin] Respawn apply error:", e); }
            }, 200);
        });
    }

    // ----------------------------------------------------------
    // Core: apply all saved skin slots
    // ----------------------------------------------------------
    applyAllSkins(server, client, skin) {
        const character = client.character;
        let applied = 0;
        for (const [equipSlotIdStr, target] of Object.entries(skin)) {
            const equipSlotId = Number(equipSlotIdStr);
            // Find which loadout slot this equipment slot maps to.
            const loadoutSlotId = this.loadoutSlotForEquipSlot(server, character, equipSlotId, target);
            if (!loadoutSlotId) {
                console.log(
                    `[SkinPlugin] equipSlot ${equipSlotId}: no loadout item matches saved skin ` +
                    `(empty slot, wrong item type, or item def missing from plugin JSON — check ITEMS_PATH / server defs). Skipping.`
                );
                continue;
            }
            this.patchSlot(server, client, equipSlotId, loadoutSlotId, target);
            applied++;
        }
        if (applied === 0) return;
        // Push fresh loadout packet directly to this client.
        this.pushLoadoutPacket(server, client);
        // Push fresh equipment packet to everyone who can see this character.
        character.updateEquipment(server);
        console.log(`[SkinPlugin] Applied ${applied} skin slot(s) for ${this.getCharName(client)}`);
    }

    // ----------------------------------------------------------
    // patchSlot: replaces a loadout slot with the skin item by calling
    //            _origEquipItem directly (bypasses the hook, no recursion).
    //            This goes through the full engine pipeline so the client's
    //            item table (ItemAdd/ItemDelete) is updated correctly.
    // ----------------------------------------------------------
    patchSlot(server, client, equipSlotId, loadoutSlotId, target) {
        const character = client.character;
        const loadout   = character._loadout || {};

        const currentItem = loadout[loadoutSlotId];
        if (!currentItem) {
            console.log(`[SkinPlugin] patchSlot: no loadout item at slot ${loadoutSlotId}`);
            return;
        }

        const skinItemDefId = target.skinItemDefId || this.resolveSkinItemDefId(target.modelName, target.textureAlias);
        if (!skinItemDefId) {
            console.log(`[SkinPlugin] patchSlot: could not resolve skinItemDefId for model="${target.modelName}" tex="${target.textureAlias}"`);
            return;
        }

        // Already the correct skin item — nothing to do.
        if (skinItemDefId === currentItem.itemDefinitionId) return;

        console.log(`[SkinPlugin] Slot ${loadoutSlotId}: itemDef ${currentItem.itemDefinitionId} → ${skinItemDefId} (${this.itemNames[skinItemDefId] || "?"})`);

        const oldGuid   = currentItem.itemGuid;
        const skinItem  = server.generateItem(skinItemDefId, 1);
        if (!skinItem) {
            console.log(`[SkinPlugin] patchSlot: generateItem(${skinItemDefId}) returned null`);
            return;
        }
        skinItem.currentDurability = currentItem.currentDurability;
        skinItem.stackCount        = currentItem.stackCount;
        // Preserve weapon ammo / reload state from the item being replaced.
        if (currentItem.weapon && skinItem.weapon) {
            skinItem.weapon.ammoCount          = currentItem.weapon.ammoCount;
            skinItem.weapon.currentReloadCount = currentItem.weapon.currentReloadCount;
        }

        // Clear the existing container for this slot BEFORE calling origEquipItem.
        // origEquipItem has container-swap logic: if _containers[slot] exists it
        // reads its itemDefinitionId and calls lootItem() to put the old container
        // item back into the player's inventory.  We're doing a silent skin swap,
        // so we don't want the base item re-appearing in the player's bags.
        delete character._containers[loadoutSlotId];

        // Call the original unhooked equipItem so the engine goes through its
        // full pipeline: creates a LoadoutItem, stores it in _loadout[slot],
        // sends ClientUpdate.ItemAdd for the new skin item, sends
        // Loadout.SetLoadoutSlots, and updates the equipment visual from the
        // skin item's definition.  We bypass our hook so there's no recursion.
        this._origEquipItem.call(character, server, skinItem, true, loadoutSlotId);

        // Delete the stale base item GUID from the client's item table.
        // (The engine already replaced _loadout[slot] with the skin item above.)
        server.deleteItem(character, oldGuid);
    }

    // Send Loadout.SetLoadoutSlots directly to the owning client only.
    pushLoadoutPacket(server, client) {
        try {
            server.sendData(client, "Loadout.SetLoadoutSlots", client.character.pGetLoadoutSlots());
        } catch (e) { console.error("[SkinPlugin] pushLoadoutPacket error:", e); }
    }

    // ----------------------------------------------------------
    // Slot resolution helpers
    // ----------------------------------------------------------

    /** Item def from plugin JSON and/or live server (paths can drift). */
    getItemDef(server, itemDefinitionId) {
        if (!itemDefinitionId) return undefined;
        const local = this.allItems[itemDefinitionId];
        if (local) return local;
        if (server && typeof server.getItemDefinition === "function") {
            return server.getItemDefinition(itemDefinitionId);
        }
        return undefined;
    }

    /** Given a loadout slot, return the equipment slot the equipped item occupies. */
    equipSlotForLoadoutSlot(character, loadoutSlotId, server) {
        const item = character?._loadout?.[loadoutSlotId];
        if (!item?.itemDefinitionId) return 0;
        const def = this.getItemDef(server, item.itemDefinitionId);
        if (!def) return 0;
        const passive = def.PASSIVE_EQUIP_SLOT_ID || 0;
        const active  = def.ACTIVE_EQUIP_SLOT_ID  || 0;
        if (active && character.currentLoadoutSlot === loadoutSlotId) return active;
        return passive || active || 0;
    }

    /** Given an equipment slot, return the loadout slot whose item occupies it.
     *  Strategy 1: match by item GUID (normalized).
     *  Strategy 2: PASSIVE/ACTIVE on defs from plugin or server.getItemDefinition.
     *  Strategy 3: saved skin MTX baseItemDefId matches loadout item (armor 100, etc.).
     *  Strategy 4: loadout already has skinItemDefId and it maps to this equip slot. */
    loadoutSlotForEquipSlot(server, character, equipSlotId, skinTarget) {
        const equipment = character?._equipment || {};
        const loadout   = character?._loadout   || {};

        // Strategy 1 – GUID match
        const equipGuid = equipment[equipSlotId]?.guid;
        if (equipGuid) {
            for (const [slotIdStr, slotItem] of Object.entries(loadout)) {
                if (this.guidMatches(slotItem?.itemGuid, equipGuid)) return Number(slotIdStr);
            }
        }

        // Strategy 2 – item def maps to this equipment slot
        for (const [slotIdStr, slotItem] of Object.entries(loadout)) {
            if (!slotItem?.itemDefinitionId) continue;
            const def = this.getItemDef(server, slotItem.itemDefinitionId);
            if (!def) continue;
            const passive = def.PASSIVE_EQUIP_SLOT_ID || 0;
            const active  = def.ACTIVE_EQUIP_SLOT_ID  || 0;
            if (passive === equipSlotId || active === equipSlotId) return Number(slotIdStr);
        }

        // Strategy 3 – MTX base item is in loadout (handles stale _equipment GUIDs)
        const rewardId = skinTarget?.skinItemDefId;
        if (rewardId) {
            const re = this.mtxRewardMap.get(rewardId);
            const baseId = re?.baseItemDefId;
            if (baseId) {
                for (const [slotIdStr, slotItem] of Object.entries(loadout)) {
                    if (slotItem?.itemDefinitionId === baseId) return Number(slotIdStr);
                }
            }
        }

        // Strategy 4 – skin reward already equipped; confirm slot maps to equipSlotId
        if (rewardId) {
            for (const [slotIdStr, slotItem] of Object.entries(loadout)) {
                if (slotItem?.itemDefinitionId !== rewardId) continue;
                const def = this.getItemDef(server, rewardId);
                if (!def) continue;
                const passive = def.PASSIVE_EQUIP_SLOT_ID || 0;
                const active  = def.ACTIVE_EQUIP_SLOT_ID  || 0;
                if (passive === equipSlotId || active === equipSlotId) return Number(slotIdStr);
            }
        }

        return 0;
    }

    /** Compact loadout snapshot for logs: slot:defId=guid */
    summarizeLoadoutGuids(character) {
        const loadout = character?._loadout || {};
        return Object.keys(loadout)
            .sort((a, b) => Number(a) - Number(b))
            .map((sid) => {
                const li = loadout[sid];
                return `${sid}:def${li?.itemDefinitionId}=${String(li?.itemGuid)}`;
            })
            .join(" | ");
    }

    guidMatches(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        return String(a).toLowerCase() === String(b).toLowerCase();
    }

    /** After origEquipItem, find which loadout slot was just filled by this item. */
    resolveLoadoutSlot(character, itemGuid, fallbackSlotId, log) {
        const dbg = typeof log === "function" ? log : () => {};
        const lo = character?._loadout?.[fallbackSlotId]?.itemGuid;
        if (fallbackSlotId && this.guidMatches(lo, itemGuid)) {
            dbg("resolveLoadoutSlot: matched fallback", { fallbackSlotId, itemGuid });
            return fallbackSlotId;
        }
        if (fallbackSlotId && character?._loadout?.[fallbackSlotId]) {
            dbg("resolveLoadoutSlot: fallback slot occupied by different guid", {
                fallbackSlotId,
                itemGuid,
                itemGuidType: typeof itemGuid,
                loadoutGuid: lo,
                loadoutGuidType: typeof lo,
                strictEq: lo === itemGuid,
                looseEq: lo == itemGuid
            });
        }
        if (!itemGuid || !character?._loadout) {
            dbg("resolveLoadoutSlot: no itemGuid or no _loadout");
            return 0;
        }
        for (const [slotIdStr, slotItem] of Object.entries(character._loadout)) {
            if (this.guidMatches(slotItem?.itemGuid, itemGuid)) {
                dbg("resolveLoadoutSlot: matched by scan", { slot: Number(slotIdStr), itemGuid });
                return Number(slotIdStr);
            }
        }
        dbg("resolveLoadoutSlot: no slot matched itemGuid");
        return 0;
    }

    /**
     * Pick which saved skin row applies to the item now in resolvedLoadoutSlot.
     * - If loadout item is already the saved skin def, return null (no swap).
     * - Else prefer skin[equipSlot] when PASSIVE/ACTIVE maps to an equipment slot.
     * - Else if defs have no equip slot (0), match MTX baseItemDefId to current def.
     */
    findSkinTarget(character, skin, resolvedLoadoutSlot, log, server) {
        const dbg = typeof log === "function" ? log : () => {};
        const loadItem = character?._loadout?.[resolvedLoadoutSlot];
        const defId    = loadItem?.itemDefinitionId;
        if (!defId) {
            dbg("findSkinTarget: no itemDefinitionId on loadout slot");
            return null;
        }

        for (const s of Object.values(skin)) {
            if (s.skinItemDefId === defId) {
                dbg("findSkinTarget: already skin item — skip", { defId });
                return null;
            }
        }

        const equipSlot = this.equipSlotForLoadoutSlot(character, resolvedLoadoutSlot, server);
        dbg("findSkinTarget: equipSlot resolution", {
            resolvedLoadoutSlot,
            currentLoadoutSlot: character.currentLoadoutSlot,
            equipSlot,
            savedKeys: Object.keys(skin).join(","),
            skinAtEquipSlot: equipSlot ? !!skin[equipSlot] : false
        });
        if (equipSlot && skin[equipSlot]) {
            dbg("findSkinTarget: pick skin[equipSlot]", { equipSlot, skinItemDefId: skin[equipSlot].skinItemDefId });
            return skin[equipSlot];
        }

        const def = this.getItemDef(server, defId);
        if (def) {
            const passive = def.PASSIVE_EQUIP_SLOT_ID || 0;
            const active  = def.ACTIVE_EQUIP_SLOT_ID  || 0;
            if (passive && skin[passive]) {
                dbg("findSkinTarget: skin[PASSIVE_EQUIP_SLOT_ID]", { passive });
                return skin[passive];
            }
            if (active && character.currentLoadoutSlot === resolvedLoadoutSlot && skin[active]) {
                dbg("findSkinTarget: skin[ACTIVE] (current loadout row)", { active });
                return skin[active];
            }
        }

        // Engine’s _equipment map is authoritative for which attachment slot an item uses
        // (weapons especially). Match saved skin key by GUID.
        const eg = character._equipment || {};
        for (const [slotKey, equipData] of Object.entries(eg)) {
            if (!equipData?.guid) continue;
            if (!this.guidMatches(equipData.guid, loadItem.itemGuid)) continue;
            const k = Number(slotKey);
            if (skin[k]) {
                dbg("findSkinTarget: _equipment guid → skin[key]", { equipSlot: k });
                return skin[k];
            }
        }

        for (const s of Object.values(skin)) {
            const sid = s.skinItemDefId;
            if (!sid) continue;
            const re = this.mtxRewardMap.get(sid);
            if (re && re.baseItemDefId === defId) {
                dbg("findSkinTarget: MTX base match", { defId, rewardSkinDefId: sid, baseItemDefId: re.baseItemDefId });
                return s;
            }
        }
        dbg("findSkinTarget: no skin row matched", { defId, equipSlot });
        return null;
    }

    // ----------------------------------------------------------
    // Skin capture (saveskin command)
    // ----------------------------------------------------------
    captureEquipment(client, server) {
        const skin      = {};
        const character = client.character;
        const loadout   = character._loadout   || {};
        const equipment = character._equipment || {};
        const gender    = character.gender == 1 ? "Male" : "Female";

        // Iterate the LOADOUT (authoritative) rather than _equipment (may have
        // stale GUIDs after skin patches).  For each loadout slot, resolve the
        // equipment slot via the item def's PASSIVE/ACTIVE_EQUIP_SLOT_ID and
        // store the skin keyed by equipment slot so it matches the apply path.
        for (const [loadoutSlotIdStr, loadoutItem] of Object.entries(loadout)) {
            if (!loadoutItem?.itemDefinitionId) continue;
            const def = this.getItemDef(server, loadoutItem.itemDefinitionId);
            if (!def?.MODEL_NAME) continue;

            const equipSlotId = this.equipSlotForLoadoutSlot(character, Number(loadoutSlotIdStr), server);
            if (!equipSlotId) continue;

            // Don't capture the same equipment slot twice (e.g. dual-wield edge cases).
            if (skin[equipSlotId]) continue;

            const equip = equipment[equipSlotId];
            skin[equipSlotId] = {
                modelName:        def.MODEL_NAME.replace("<gender>", gender),
                textureAlias:     def.TEXTURE_ALIAS  || "",
                effectId:         def.EFFECT_ID       || 0,
                tintAlias:        equip?.tintAlias     || "",
                decalAlias:       equip?.decalAlias    || "#",
                shaderParamGroup: Array.isArray(equip?.SHADER_PARAMETER_GROUP) ? [...equip.SHADER_PARAMETER_GROUP] : [],
                skinItemDefId:    loadoutItem.itemDefinitionId  // exact — straight from loadout
            };
        }
        return skin;
    }

    /** Normalise texture alias: item defs store "" but equipment packets use "Default".
     *  Treat both as equivalent so lookups work either way. */
    normTex(tex) {
        if (!tex || tex === "Default") return "";
        return tex;
    }

    /** Resolve the item definition ID for a given model + texture.
     *  1. MTX conversion table (normalised texture)
     *  2. Full model + normalised texture match in item definitions
     *  NOTE: model-only fallback is intentionally omitted — many items share
     *        a model and a wrong match is worse than no match. */
    resolveSkinItemDefId(modelName, textureAlias) {
        const normalisedTex = this.normTex(textureAlias);

        // MTX map was built with normalised ("") textures.
        const key      = `${modelName}|${normalisedTex}`;
        const mtxEntry = this.mtxMap.get(key);
        if (mtxEntry?.rewardItemId) return mtxEntry.rewardItemId;

        // Exact model + normalised texture match in item definitions.
        return this.findItemDefByModelAndTexture(modelName, normalisedTex);
    }

    findItemDefByModelAndTexture(modelName, textureAlias) {
        const normTex = this.normTex(textureAlias);
        for (const [idStr, def] of Object.entries(this.allItems)) {
            const m = (def.MODEL_NAME || "").replace("<gender>", "Male");
            const t = this.normTex(def.TEXTURE_ALIAS || "");
            if (m === modelName && t === normTex) return Number(idStr);
        }
        return 0;
    }


    // ----------------------------------------------------------
    // Ownership validation  (for saveskin)
    // ----------------------------------------------------------
    async validateSkinOwnership(server, client, skin) {
        const validated  = {};
        const charName   = this.getCharName(client);
        let ownedItems;
        try {
            const raw = await server.accountInventoriesManager.getAccountItems(client.loginSessionId);
            ownedItems = new Set(raw.map((i) => i.itemDefinitionId));
        } catch {
            console.log("[SkinPlugin] Could not fetch account inventory for", charName);
            return {};
        }

        const loadoutDefIds = new Set(
            Object.values(client.character._loadout || {})
                .map((s) => s?.itemDefinitionId)
                .filter(Boolean)
        );

        for (const [slotId, slot] of Object.entries(skin)) {
            const defId    = slot.skinItemDefId || 0;

            // Primary check: look up the item def directly in the reward map.
            // This is exact — no model/texture ambiguity between skins.
            const rewardEntry = defId ? this.mtxRewardMap.get(defId) : null;
            if (rewardEntry) {
                if (ownedItems.has(rewardEntry.accountItemId)) {
                    validated[slotId] = { ...slot };
                } else {
                    const itemName = this.itemNames[defId] || `#${defId}`;
                    console.log(`[SkinPlugin] ${charName} unowned MTX "${itemName}" in slot ${slotId} — resetting`);
                    if (rewardEntry.baseItemDefId) {
                        const baseDef = this.allItems[rewardEntry.baseItemDefId];
                        if (baseDef?.MODEL_NAME) {
                            const gender = slot.modelName?.includes("Female") ? "Female" : "Male";
                            validated[slotId] = {
                                modelName:    baseDef.MODEL_NAME.replace("<gender>", gender),
                                textureAlias: baseDef.TEXTURE_ALIAS || "",
                                effectId: 0, tintAlias: "", decalAlias: "#",
                                shaderParamGroup: [], skinItemDefId: rewardEntry.baseItemDefId
                            };
                        }
                    }
                }
                continue;
            }

            // Fallback: model+texture MTX map check (old save format without skinItemDefId).
            const key      = `${slot.modelName}|${this.normTex(slot.textureAlias)}`;
            const mtxEntry = this.mtxMap.get(key);
            if (mtxEntry) {
                if (ownedItems.has(mtxEntry.accountItemId)) {
                    validated[slotId] = { ...slot };
                } else {
                    const itemName = this.itemNames[mtxEntry.rewardItemId] || `#${mtxEntry.rewardItemId}`;
                    console.log(`[SkinPlugin] ${charName} unowned MTX "${itemName}" in slot ${slotId} — resetting`);
                    if (mtxEntry.baseModelName) {
                        validated[slotId] = {
                            modelName: mtxEntry.baseModelName, textureAlias: mtxEntry.baseTextureAlias,
                            effectId: 0, tintAlias: "", decalAlias: "#", shaderParamGroup: [], skinItemDefId: mtxEntry.baseItemDefId
                        };
                    }
                }
                continue;
            }

            // Non-MTX item — allow it as-is.
            validated[slotId] = { ...slot };
        }
        return validated;
    }
}
exports.default = ServerPlugin;
