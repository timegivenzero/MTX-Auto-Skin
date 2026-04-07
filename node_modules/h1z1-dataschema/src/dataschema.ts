import "h1z1-buffer";

export interface h1z1Buffer extends Buffer {
  writeBytes(value: any, offset: number, length?: any): any;
  writePrefixedStringLE(value: any, offset: number): any;
  writeUInt64String(value: any, offset: number): any;
  writeInt64String(value: any, offset: number): any;
  writeNullTerminatedString(value: any, offset: number): any;
  readBytes(offset: number, length: any): any;
  readPrefixedStringLE(offset: number): any;
  readUInt64String(offset: number): any;
  readInt64String(offset: number): any;
  readNullTerminatedString(offset: number): any;
}

function parse(fields: any, dataToParse: Buffer, offset: number): any {
  const data = dataToParse as h1z1Buffer;
  const startOffset = offset;
  const result: any = {};
  fields = fields || [];
  for (let index = 0; index < fields.length; index++) {
    const field: any = fields[index];
    switch (field.type) {
      case "schema":
        const element = parse(field.fields, data, offset);
        offset += element.length;
        result[field.name] = element.result;
        break;
      case "array":
      case "array8":
        const elements = [];
        let numElements = 0;
        if ("length" in field) {
          numElements = field.length;
        } else {
          if (field.type == "array") {
            numElements = data.readUInt32LE(offset);
            offset += 4;
          } else if (field.type == "array8") {
            numElements = data.readUInt8(offset);
            offset += 1;
          }
        }
        if (field.fields) {
          for (let j = 0; j < numElements; j++) {
            const element = parse(field.fields, data, offset);
            offset += element.length;
            elements.push(element.result);
          }
        } else if (field.elementType) {
          const elementSchema = [{ name: "element", type: field.elementType }];
          for (let j = 0; j < numElements; j++) {
            const element = parse(elementSchema, data, offset);
            offset += element.length;
            elements.push(element.result.element);
          }
        }
        result[field.name] = elements;
        break;
      case "debug":
        console.error("[debug-parse]" + field.name);
        break;
      case "debugoffset":
        result[field.name] = offset;
        break;
      case "debugbytes":
        result[field.name] = data.readBytes(offset, field.length);
        break;
      case "bytes":
        const bytes = data.readBytes(offset, field.length);
        result[field.name] = bytes;
        offset += field.length;
        break;
      case "byteswithlength":
        const length = data.readUInt32LE(offset);
        offset += 4;
        if (length > 0) {
          if (field.fields) {
            const element = parse(field.fields, data, offset);
            if (element) {
              result[field.name] = element.result;
            }
          } else {
            const bytes = data.readBytes(offset, length);
            result[field.name] = bytes;
          }
          offset += length;
        }
        break;
      case "uint32":
        result[field.name] = data.readUInt32LE(offset);
        offset += 4;
        break;
      case "int32":
        result[field.name] = data.readInt32LE(offset);
        offset += 4;
        break;
      case "uint16":
        result[field.name] = data.readUInt16LE(offset);
        offset += 2;
        break;
      case "int16":
        result[field.name] = data.readInt16LE(offset);
        offset += 2;
        break;
      case "uint8":
        result[field.name] = data.readUInt8(offset);
        offset += 1;
        break;
      case "int8":
        result[field.name] = data.readInt8(offset);
        offset += 1;
        break;
      case "rgb":
        result[field.name] = {
          r: data.readInt8(offset),
          g: data.readInt8(offset + 1),
          b: data.readInt8(offset + 2),
        };
        offset += 3;
        break;
      case "rgba":
        result[field.name] = {
          r: data.readInt8(offset),
          g: data.readInt8(offset + 1),
          b: data.readInt8(offset + 2),
          a: data.readInt8(offset + 3),
        };
        offset += 4;
        break;
      case "argb":
        result[field.name] = {
          a: data.readInt8(offset),
          r: data.readInt8(offset + 1),
          g: data.readInt8(offset + 2),
          b: data.readInt8(offset + 3),
        };
        offset += 4;
        break;
      case "int64":
      case "uint64": {
        const value: BigInt = data.readBigInt64LE(offset);
        offset += 8;
        return value;
      }
      case "uint64string":
      case "int64string":
        let str = "0x";
        for (let j = 7; j >= 0; j--) {
          str += ("0" + data.readUInt8(offset + j).toString(16)).substr(-2);
        }
        result[field.name] = str;
        offset += 8;
        break;
      case "variabletype8":
        const vtypeidx = data.readUInt8(offset),
          vtype = field.types[vtypeidx];
        offset += 1;
        if (vtype) {
          if (Array.isArray(vtype)) {
            const variable = parse(vtype, data, offset);
            offset += variable.length;
            result[field.name] = {
              type: vtypeidx,
              value: variable.result,
            };
          } else {
            const variableSchema = [{ name: "element", type: vtype }];
            const variable: any = parse(variableSchema, data, offset);
            offset += variable.length;
            result[field.name] = {
              type: vtypeidx,
              value: variable.result.element,
            };
          }
        }
        break;
      case "bitflags":
        const value = data.readUInt8(offset);
        const flags: any = {};
        for (let j = 0; j < field.flags.length; j++) {
          const flag = field.flags[j];
          flags[flag.name] = !!(value & (1 << flag.bit));
        }
        result[field.name] = flags;
        offset += 1;
        break;
      case "float":
        result[field.name] = data.readFloatLE(offset);
        offset += 4;
        break;
      case "double":
        result[field.name] = data.readDoubleLE(offset);
        offset += 8;
        break;
      case "floatvector2":
        result[field.name] = [
          data.readFloatLE(offset),
          data.readFloatLE(offset + 4),
        ];
        offset += 8;
        break;
      case "floatvector3":
        result[field.name] = [
          data.readFloatLE(offset),
          data.readFloatLE(offset + 4),
          data.readFloatLE(offset + 8),
        ];
        offset += 12;
        break;
      case "floatvector4":
        result[field.name] = [
          data.readFloatLE(offset),
          data.readFloatLE(offset + 4),
          data.readFloatLE(offset + 8),
          data.readFloatLE(offset + 12),
        ];
        offset += 16;
        break;
      case "boolean":
        result[field.name] = !!data.readUInt8(offset);
        offset += 1;
        break;
      case "string": {
        const string = data.readPrefixedStringLE(offset);
        result[field.name] = string;
        offset += 4 + string.length;
        break;
      }
      case "fixedlengthstring": {
        const string = data.toString("utf8", offset, offset + field.length);
        result[field.name] = string;
        offset += string.length;
        break;
      }
      case "nullstring": {
        const string = data.readNullTerminatedString(offset);
        result[field.name] = string;
        offset += 1 + string.length;
        break;
      }
      case "custom":
        const tmp = field.parser(data, offset);
        result[field.name] = tmp.value;
        offset += tmp.length;
        break;
    }
  }
  return {
    result: result,
    length: offset - startOffset,
  };
}

function getValueFromObject(field: any, object: any) {
  // Check for Buffer
  if (Buffer.isBuffer(object)) {
    return object;
  }

  // Check if field exists in object
  if (!object.hasOwnProperty(field.name)) {
    return getDefaultValue(field, object);
  }

  // Field exists, return its value
  return object[field.name];
}

function getDefaultValue(field: any, object: any) {
  // Check if field has a defaultValue
  if (field.hasOwnProperty("defaultValue")) {
    return field.defaultValue;
  }

  // Log an error if defaultValue is not available
  throw `Field ${field.name} not found in data object: ${JSON.stringify(
    object,
    null,
    4,
  )}`;
}

function calculateDataLength(fields: any[], object: any): number {
  fields = fields || [];
  let length = 0;
  for (let index = 0; index < fields.length; index++) {
    const field: any = fields[index];
    switch (field.type) {
      case "schema":
        const value = getValueFromObject(field, object);
        length += calculateDataLength(field.fields, value);
        break;
      case "array":
      case "array8":
        if (!field.fixedLength) {
          length += field.type == "array" ? 4 : 1;
        }
        const elements = object[field.name];
        if (field.fields) {
          if (elements?.length) {
            for (let j = 0; j < elements.length; j++) {
              length += calculateDataLength(field.fields, elements[j]);
            }
          }
        } else if (field.elementType) {
          const elementSchema = [{ name: "element", type: field.elementType }];
          for (let j = 0; j < elements.length; j++) {
            length += calculateDataLength(elementSchema, {
              element: elements[j],
            });
          }
        }
        break;
      case "bytes":
        length += field.length;
        break;
      case "byteswithlength": {
        length += 4;
        const value = getValueFromObject(field, object);
        if (value) {
          length += field.fields
            ? calculateDataLength(field.fields, value)
            : value.length;
        }
        break;
      }
      case "int64":
      case "uint64":
      case "uint64string":
      case "int64string":
      case "double":
        length += 8;
        break;
      case "rgb":
        length += 3;
        break;
      case "uint32":
      case "int32":
      case "float":
      case "rgba":
      case "argb":
        length += 4;
        break;
      case "floatvector2":
        length += 8;
        break;
      case "floatvector3":
        length += 12;
        break;
      case "floatvector4":
        length += 16;
        break;
      case "uint16":
      case "int16":
        length += 2;
        break;
      case "uint8":
      case "int8":
      case "boolean":
      case "bitflags":
        length += 1;
        break;
      case "string": {
        const value = getValueFromObject(field, object);
        length += 4 + value.length;
        break;
      }
      case "fixedlengthstring": {
        const value = getValueFromObject(field, object);
        length += value.length;
        break;
      }
      case "nullstring": {
        const value = getValueFromObject(field, object);
        length += 1 + value.length;
        break;
      }
      case "variabletype8": {
        const value = getValueFromObject(field, object);
        length += 1;
        const vtype = field.types[value.type];
        if (Array.isArray(vtype)) {
          length += calculateDataLength(vtype, value.value);
        } else {
          const variableSchema = [{ name: "element", type: vtype }];
          length += calculateDataLength(variableSchema, {
            element: value.value,
          });
        }
        break;
      }
      case "debug": {
        console.error("[debug-calculateDataLength]" + field.name);
        break;
      }
      case "custom": {
        const value = getValueFromObject(field, object);
        const tmp = field.packer(value);
        length += tmp.length;
        break;
      }
    }
  }
  return length;
}

function pack(
  fields: any,
  object: any,
  dataToPack?: Buffer,
  offset?: number,
): { data: Buffer; length: number } {
  let data = dataToPack as h1z1Buffer;
  if (!fields) {
    return {
      data: new (Buffer.alloc as any)(0),
      length: 0,
    };
  }

  if (!data) {
    const dataLength = calculateDataLength(fields, object);
    data = new (Buffer.allocUnsafe as any)(dataLength);
  }
  offset = offset || 0;
  const startOffset = offset;
  for (let index = 0; index < fields.length; index++) {
    const field: any = fields[index];
    let value = getValueFromObject(field, object);
    let result;
    switch (field.type) {
      case "schema":
        offset += pack(field.fields, value, data, offset).length;
        break;
      case "array":
      case "array8":
        if (!field.fixedLength) {
          if (field.type == "array") {
            data.writeUInt32LE(value.length, offset);
            offset += 4;
          } else {
            data.writeUInt8(value.length, offset);
            offset += 1;
          }
        }
        if (field.fixedLength && field.fixedLength != value.length) {
          throw `Array (${field.name}) length isn't respected ${value.length}/${field.fixedLength}`;
        }
        if (field.fields) {
          for (let j = 0; j < value.length; j++) {
            result = pack(field.fields, value[j], data, offset);
            offset += result.length;
          }
        } else if (field.elementType) {
          const elementSchema = [{ name: "element", type: field.elementType }];
          for (let j = 0; j < value.length; j++) {
            result = pack(elementSchema, { element: value[j] }, data, offset);
            offset += result.length;
          }
        } else {
          throw "Invalid array schema";
        }
        break;
      case "bytes":
        if (!Buffer.isBuffer(value)) {
          value = new (Buffer.from as any)(value);
        }
        data.writeBytes(value, offset, field.length);
        offset += field.length;
        break;
      case "byteswithlength":
        if (value) {
          if (field.fields && !Buffer.isBuffer(value)) {
            value = pack(field.fields, value).data;
          }
          if (!Buffer.isBuffer(value)) {
            value = new (Buffer.from as any)(value);
          }
          data.writeUInt32LE(value.length, offset);
          offset += 4;
          data.writeBytes(value, offset);
          offset += value.length;
        } else {
          data.writeUInt32LE(0, offset);
          offset += 4;
        }
        break;
      case "uint64":
        data.writeBigUInt64LE(BigInt(value), offset);
        offset += 8;
        break;
      case "uint64string":
      case "int64string":
        for (let j = 0; j < 8; j++) {
          data.writeUInt8(
            parseInt(value.substr(2 + (7 - j) * 2, 2), 16),
            offset + j,
          );
        }
        offset += 8;
        break;
      case "uint32":
        data.writeUInt32LE(value, offset);
        offset += 4;
        break;
      case "int32":
        data.writeInt32LE(value, offset);
        offset += 4;
        break;
      case "uint16":
        data.writeUInt16LE(value, offset);
        offset += 2;
        break;
      case "int16":
        data.writeInt16LE(value, offset);
        offset += 2;
        break;
      case "uint8":
        data.writeUInt8(value, offset);
        offset += 1;
        break;
      case "int8":
        data.writeInt8(value, offset);
        offset += 1;
        break;
      case "rgb":
        data.writeInt8(value.r, offset);
        data.writeInt8(value.g, offset + 1);
        data.writeInt8(value.b, offset + 2);
        offset += 3;
        break;
      case "rgba":
        data.writeInt8(value.r, offset);
        data.writeInt8(value.g, offset + 1);
        data.writeInt8(value.b, offset + 2);
        data.writeInt8(value.a, offset + 3);
        offset += 4;
        break;
      case "argb":
        data.writeInt8(value.a, offset);
        data.writeInt8(value.r, offset + 1);
        data.writeInt8(value.g, offset + 2);
        data.writeInt8(value.b, offset + 3);
        offset += 4;
        break;
      case "bitflags":
        let flagValue = 0;
        for (let j = 0; j < field.flags.length; j++) {
          const flag = field.flags[j];
          if (value[flag.name]) {
            flagValue = flagValue | (1 << flag.bit);
          }
        }
        data.writeUInt8(flagValue, offset);
        offset += 1;
        break;
      case "float":
        data.writeFloatLE(value, offset);
        offset += 4;
        break;
      case "double":
        data.writeDoubleLE(value, offset);
        offset += 8;
        break;
      case "floatvector2":
        data.writeFloatLE(value[0], offset);
        data.writeFloatLE(value[1], offset + 4);
        offset += 8;
        break;
      case "floatvector3":
        data.writeFloatLE(value[0], offset);
        data.writeFloatLE(value[1], offset + 4);
        data.writeFloatLE(value[2], offset + 8);
        offset += 12;
        break;
      case "floatvector4":
        data.writeFloatLE(value[0], offset);
        data.writeFloatLE(value[1], offset + 4);
        data.writeFloatLE(value[2], offset + 8);
        data.writeFloatLE(value[3], offset + 12);
        offset += 16;
        break;
      case "boolean":
        data.writeUInt8(value ? 1 : 0, offset);
        offset += 1;
        break;
      case "string":
        data.writePrefixedStringLE(value, offset);
        offset += 4 + value.length;
        break;
      case "fixedlengthstring":
        data.write(value, offset, value.length, "utf8");
        offset += value.length;
        break;
      case "nullstring":
        data.writeNullTerminatedString(value, offset);
        offset += 1 + value.length;
        break;
      case "variabletype8":
        data.writeUInt8(value.type, offset);
        offset++;
        const vtype = field.types[value.type];
        if (Array.isArray(vtype)) {
          result = pack(vtype, value.value, data, offset);
        } else {
          const variableSchema = [{ name: "element", type: vtype }];
          result = pack(variableSchema, { element: value.value }, data, offset);
        }
        offset += result.length;
        break;
      case "custom":
        const customData = field.packer(value);
        customData.copy(data, offset);
        offset += customData.length;
        break;
      case "debug":
        console.error("[debug-pack]" + field.name);
        break;
      default:
        throw `Unknown field type: ${field.type}`;
    }
  }
  return {
    data: data,
    length: offset - startOffset,
  };
}

const dataschema = {
  pack: pack,
  parse: parse,
  calculateDataLength: calculateDataLength,
};
export default dataschema;
