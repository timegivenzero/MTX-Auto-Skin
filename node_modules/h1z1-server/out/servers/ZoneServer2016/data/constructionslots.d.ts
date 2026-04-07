interface SlotOffsets {
    yOffset: number;
    authorizedItems: Array<number>;
    offsets: Array<number>;
    angles: Array<number>;
    rotationOffsets: Array<number>;
}
export type ConstructionSlots = {
    [itemDefId: number]: SlotOffsets;
};
export declare const wallSlotDefinitions: ConstructionSlots;
export declare const upperWallSlotDefinitions: ConstructionSlots;
export declare const shelterSlotDefinitions: ConstructionSlots;
export declare const foundationExpansionSlotDefinitions: ConstructionSlots;
export declare const foundationRampSlotDefinitions: ConstructionSlots;
export {};
