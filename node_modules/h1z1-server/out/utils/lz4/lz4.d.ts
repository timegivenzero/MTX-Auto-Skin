/**
    Javascript version of the key LZ4 C functions

    Copyright (c) 2012 Pierre Curto
    https://github.com/pierrec/node-lz4

    see ./LICENSE
 */
/**
 * Decode a block. Assumptions: input contains all sequences of a
 * chunk, output is large enough to receive the decoded data.
 * If the output buffer is too small, an error will be thrown.
 * If the returned value is negative, an error occured at the returned offset.
 *
 * @param input {Buffer} input data
 * @param output {Buffer} output data
 * @param sIdx
 * @param eIdx
 * @param sIdx
 * @param eIdx
 * @return {Number} number of decoded bytes
 * @private
 */
export declare const uncompress: (input: string | any[], output: any[], sIdx: number, eIdx: number) => number;
export declare const compressBound: (isize: number) => number;
export declare const compress: (src: any, dst: any[], sIdx: any, eIdx: any) => number;
export declare const compressBlock: (src: string | any[], dst: any[], pos: number, hashTable: any[], sIdx: number, eIdx: number) => number;
export declare const compressDependent: (src: string | any[], dst: any[], pos: number, hashTable: any[], sIdx: number, eIdx: number) => number;
