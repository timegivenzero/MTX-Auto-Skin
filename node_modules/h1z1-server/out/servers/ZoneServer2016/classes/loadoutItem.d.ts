import { ZoneServer2016 } from "../zoneserver";
import { BaseItem } from "./baseItem";
export declare class LoadoutItem extends BaseItem {
    loadoutItemOwnerGuid: string;
    constructor(item: BaseItem, loadoutSlotId: number, loadoutItemOwnerGuid: string);
    transferLoadoutItem(server: ZoneServer2016, targetCharacterId: string, newSlotId: number): void;
}
