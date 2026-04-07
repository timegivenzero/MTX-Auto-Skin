import { npcData, seats, passengers, positionUpdate } from "../../../types/zoneserver";
import { ZoneClient } from "./zoneclient";
export declare class Vehicle {
    worldId: number;
    vehicleType: string;
    isManaged: boolean;
    manager?: any;
    destroyedEffect: number;
    engineOn: boolean;
    npcData: npcData;
    isLocked: number;
    unknownGuid1: string;
    positionUpdate: positionUpdate;
    seat: seats;
    passengers: passengers;
    fuelUpdater: any;
    isInvulnerable: boolean;
    onReadyCallback?: (clientTriggered: ZoneClient) => boolean;
    onDismount?: any;
    resourcesUpdater?: any;
    damageTimeout?: any;
    constructor(worldId: number, characterId: string, transientId: number, modelId: number, position: Float32Array, rotation: Float32Array);
}
