/*
 * Todo:
 * Documentation
 * Non-String things,
 *  number: auto-size based on number? (requires a type written into the output)
 * complex type:
 *  defined prototype? new'd?
 * types to add
 *  fixed size arrays (length defined in schema, not stored)
 *   eg: {type: 'uint8', count: 4} => [0,0,0,0]
 *   would throw error during encode if the count on the array element was different than the expected count
 * can we reduce the number of type lists?
 * recursion detection
 *  is there anything to do about it? (eg: reference managment?)
 *  reference idea: designate in options for complex types to be references, in this case a reference only uses a uint32 value, which is then back written, referenced items are written at the end of the data (like a heap) and the address of those are back written. During deserialization, reference items are remembered and used in place when detected.
 * clone the schmea/definitions instead of using references
 */
/**
 * Class for packing and unpacking objects to and from a binary format
 * @classdef 
 */
class BinaryPacker {
  /**
   * internal reference to the binary buffer
   * @type {ArrayBuffer}
   * @private
   */
  #buffer = null;

  /**
   * internal DataView of the binary buffer
   * @type {DataView}
   * @private
   */
  #dataView = null;

  /**
   * internal pointer in the buffer
   * @private
   */
  #position = 0;

  /**
   * schema of the current model
   * @private
   */
  #schema = {};

  /**   
   * internal list of types supported
   * @private
   */
  static #builtInDefs = [
    //'complex', //TODO - should be this handled as part of built or separate like current
    'string',
    'array',
    'binary',
    'int8', 'uint8',
    'int16', 'uint16',
    'int32', 'uint32',
    'int64', 'uint64',
    'float32', 'float64',
    'datetime'
  ];


  /**
   * internal list of referenced types not yet defined
   * @private
   */
  #pendingDefinitions = [];
  /**
   * internal list of defined types
   * @private
   */
  #definitions = {};


  /**
   * Validates the schema, retuns false on failure to validate
   * @function #validateSchema
   * @memberof BinaryPacker
   * @private
   * @param {Schema} schema {Schema} to validate, 
   * @returns {bool}
   */
  #validateSchema(schema) {

    //every type must be defined
    if (typeof (schema) === 'undefined' || schema === null) return false;
    for (let mapName in schema) {
      const map = schema[mapName];
      //todo
      const type = map.type === 'array' ? map.options.type : map.type;
      if (BinaryPacker.#builtInDefs.includes(type)) continue; //ok
      if (this.#definitions.hasOwnProperty(type)) continue; //ok
      this.#pendingDefinitions.push(type);
    }
    if (this.#pendingDefinitions.length > 0) {
      throw new Error(`undefined types: [${this.#pendingDefinitions.join(',')}]`);
    }
    return true;
  }

  /**
   * parses the definitions of the mapping
   * @function #readDefintions
   * @memberof BinaryPacker
   * @private
   * @param {Definition} definition Definition object listing all defined types
   */
  #readDefintions(definition) {
    if (typeof (definition) === 'undefined' || definition === null) return;
    for (let defProp in definition) {
      //already defined in built in
      if (BinaryPacker.#builtInDefs.includes(defProp))
        throw new Error(`duplicate definition: ${defProp}`);
      //already defined
      if (this.#definitions.hasOwnProperty(defProp))
        throw new Error(`duplicate definition: ${defProp}`);
      //already defined in built in pending
      if (this.#pendingDefinitions.includes(defProp)) {
        //NOTE: we're removing this prior to adding it in,
        //  may be a problem later if we try to do a recursive definition
        const index = this.#pendingDefinitions.indexOf(defProp);
        if (index > -1) {
          this.#pendingDefinitions.splice(index, 1);
        }
      }
      const defObj = definition[defProp];

      if (defObj.type === 'complex') {
        //recurse
        this.#definitions[defProp] = defObj;
        this.#readDefintions(defObj.schema);
      } else if (defObj.type === 'array') {
        this.#definitions[defProp] = defObj;
        //list of things
      } else if (BinaryPacker.#builtInDefs.includes(defObj.type)) {
        //is a built-in type, given an alias
        this.#definitions[defProp] = defObj;
      } else if (this.#pendingDefinitions.includes(defObj.type)) {
        // pending definition
      } else if (this.#definitions.hasOwnProperty(defObj.type)) {
        // existing definition, do nothing
      } else {
        //not defined elsewhere, add it to pending:
        this.#pendingDefinitions.push(defObj.type);
      }
    } //defintions


  } // readDefinitions


  /**
   * aligns the internal pointer to the given alignment
   * @function #byteAlignAdj
   * @memberof BinaryPacker
   * @private
   * @param {number} alignment The alignment to apply
   */
  #byteAlignAdj(alignment) {
    this.#position += (alignment - this.#position % alignment) & ~alignment;
  }
  #isTypedArray(obj) {
    const TypedArray = Object.getPrototypeOf(Uint8Array);
    return obj instanceof TypedArray;
  }

  //built-ins
  /**
   * Checks that the buffer is large enough for the given size of bytes Expands the buffer if needed with some extra padding.
   * @function #checkBufferLength
   * @memberof BinaryPacker
   * @private
   * @param {number} addedLength length to add to buffer
   * @todo tune the extra padding (currently at twice the asked for size)
   */
  #checkBufferLength(addedLength) {
    addedLength *= 2;
    const neededLength = this.#position + addedLength;
    if (neededLength > this.#buffer.byteLength) {
      this.#expandBuffer(neededLength);
    }
  }

  /**
   * Expands the size of the buffer to the given size
   * @function #expandBuffer
   * @memberof BinaryPacker
   * @private
   * @param {number} newSize Expands the buffer to the new size
   * @todo check if the new size is smaller than the existing size
   */
  #expandBuffer(newSize) {
    //too small
    if (this.#buffer.resizeable) {
      //future
      this.#buffer.resize(newSize);
      this.#dataView = new DataView(this.#buffer); //TODO - this may be not needed
    } else {
      //create new buffer, transfer stuff to it and return that.
      const newBuffer = new ArrayBuffer(newSize);
      new Uint8Array(newBuffer).set(new Uint8Array(this.#buffer));
      this.#buffer = newBuffer;
      this.#dataView = new DataView(this.#buffer);

    }
  }

  //cut off the end of the buffer.
  /**
   * Shrinks the buffer to the given size
   * @function #shrinkBuffer
   * @memberof BinaryPacker
   * @private
   * @param {number} size size to shrink the biffer to
   * @todo check of the size would be smaller than data
   */
  #shrinkBuffer(size) {
    this.#buffer = this.#buffer.slice(0, size);
    this.#dataView = new DataView(this.#buffer);
  }

  /**
   * Encodes a Date
   * @function #encodeDate
   * @memberof BinaryPacker
   * @private
   * @param {DateOptions} options Options for the date
   * @param {Date} value Date to encode
   */
  #encodeDate(options, value) {

    if (value instanceof Date === false) throw new Error('not a Date');
    const epochDate = BigInt(value.getTime());
    this.#checkBufferLength(BigUint64Array.BYTES_PER_ELEMENT);
    this.#dataView.setBigUint64(this.#position, epochDate);
    this.#position += BigUint64Array.BYTES_PER_ELEMENT;
  }

  /**
   * Decodes a Date
   * @function #decodeDate
   * @memberof BinaryPacker
   * @private
   * @param {DateOptions} options Options for the date
   * @returns {Date}
   */
  #decodeDate(options) {
    const epochDate = Number(this.#dataView.getBigUint64(this.#position));
    this.#position += BigUint64Array.BYTES_PER_ELEMENT;
    return new Date(epochDate);
  }


  /**
   * Encodes an array of items (all the same type)
   * @function #encodeArray
   * @memberof BinaryPacker
   * @private
   * @param {ArrayOptions} options Options for the array
   * @param {Array<*>} value Array to encode
   */
  #encodeArray(options, value) {
    //ensure value is actually an array
    if (typeof (value) === 'undefined' || value === null) value = [];
    if (Array.isArray(value) === false) throw new Error('element is not an array');
    //encode the size of the array (number of elements)
    this.#checkBufferLength(Uint32Array.BYTES_PER_ELEMENT);
    this.#dataView.setUint32(this.#position, value.length);
    this.#position += Uint32Array.BYTES_PER_ELEMENT;
    //for each element, encode the thing
    for (let arrayIdx = 0; arrayIdx < value.length; arrayIdx++) {

      this.#encodeComponent(options.type, options.typeOptions, value[arrayIdx]);
    }
  }

  /**
   * Decodes an array of items (all the same type)
   * @function #decodeArray
   * @memberof BinaryPacker
   * @private
   * @param {ArrayOptions} options Options for the array
   * @returns {Array<*>}
   */
  #decodeArray(options) {
    //get the length
    const arrayLength = this.#dataView.getUint32(this.#position);
    this.#position += Uint32Array.BYTES_PER_ELEMENT;
    //for each element, encode the thing
    const result = new Array(arrayLength);
    for (let arrayIdx = 0; arrayIdx < arrayLength; arrayIdx++) {
      const arrayElement = this.#decodeComponent(options.type, options.typeOptions);
      result[arrayIdx] = arrayElement;
    }
    return result;
  }

  /**
   * Encodes a string
   * @function #encodeString
   * @memberof BinaryPacker
   * @private
   * @param {StringOptions} options Options for the string
   * @param {string} value String to encode
   */
  #encodeString(options, value) {
    if (options) {
      if (typeof (options.content) !== 'undefined' && options.content !== null) {
        //has defined content, must match.
        value = options.content;
      }
    }
    //TODO do we encode the length if it is fixed size?
    const encoded = new TextEncoder().encode(value);
    //encode the length
    this.#checkBufferLength(Uint32Array.BYTES_PER_ELEMENT);
    this.#dataView.setUint32(this.#position, encoded.length);
    this.#position += Uint32Array.BYTES_PER_ELEMENT;
    this.#checkBufferLength(encoded.length);
    const stringBuf = new Uint8Array(this.#buffer, this.#position, encoded.length);
    stringBuf.set(encoded);
    this.#position += encoded.length;
  }

  /**
   * Decodes a string
   * @function #decodeString
   * @memberof BinaryPacker
   * @private
   * @param {StringOptions} options Options for the string
   * @returns {string}
   */
  #decodeString(options) {
    //get the size
    const size = this.#dataView.getUint32(this.#position);
    this.#position += Uint32Array.BYTES_PER_ELEMENT;
    const stringBuf = new Uint8Array(this.#buffer, this.#position, size);
    this.#position += size;
    const result = new TextDecoder().decode(stringBuf);
    if (options) {
      if (typeof (options.content) !== 'undefined' && options.content !== null) {
        //has defined content, must match.
        if (result !== options.content)
          throw new Error(`string content doesn't match schema definition; expected \'${options.content}\' but found \'${result}\'`);
      }
    }
    return result;
  }


  /**
   * Encodes a given ArrayBuffer
   * @function #encodeBinary
   * @memberof BinaryPacker
   * @private   
   * @param {BinaryOptions} options options for encoding
   * @param {ArrayBuffewr} value ArrayBuffer to encode
   */
  #encodeBinary(options, value) {
    if (!(value instanceof ArrayBuffer)) throw new Error(`Not a value of type ArrayBuffer`);
    //encode the length
    this.#checkBufferLength(Uint32Array.BYTES_PER_ELEMENT);
    this.#dataView.setUint32(this.#position, value.byteLength);
    this.#position += Uint32Array.BYTES_PER_ELEMENT;
    this.#checkBufferLength(value.byteLength);
    const binaryBuf = new Uint8Array(this.#buffer, this.#position, value.byteLength);
    binaryBuf.set(new Uint8Array(value));

    this.#position += value.byteLength;
  }

  /**
   * Decodes a binary value
   * @function #decodeBinary
   * @memberof BinaryPacker
   * @private   
   * @param {BinaryOptions} options options for encoding
   * @returns {ArrayBuffer}
   */
  #decodeBinary(options) {
    const size = this.#dataView.getUint32(this.#position);
    this.#position += Uint32Array.BYTES_PER_ELEMENT;
    const binaryBuf = new Uint8Array(this.#buffer, this.#position, size);
    const resultBuffer = new ArrayBuffer(size);
    new Uint8Array(resultBuffer).set(binaryBuf);
    return resultBuffer;
  }

  /**
   * Encode a value according to the given options
   * @function #encodeComponent
   * @memberof BinaryPacker
   * @private
   * @param {string} type Encoding type to be encoded
   * @param {Options} options Option of the encoding
   * @param {*} value value to be encoded
   */
  #encodeComponent(type, options, value) {
    if (BinaryPacker.#builtInDefs.includes(type)) {
      switch (type) {
      case 'array':
        this.#encodeArray(options, value);
        break;
      case 'string':
        this.#encodeString(options, value);
        break;
      case 'int8':
        this.#checkBufferLength(Int8Array.BYTES_PER_ELEMENT);
        this.#dataView.setInt8(this.#position, value);
        this.#position += Int8Array.BYTES_PER_ELEMENT;
        break;
      case 'uint8':
        this.#checkBufferLength(Uint8Array.BYTES_PER_ELEMENT);
        this.#dataView.setUint8(this.#position, value);
        this.#position += Uint8Array.BYTES_PER_ELEMENT;
        break;
      case 'int16':
        this.#checkBufferLength(Int16Array.BYTES_PER_ELEMENT);
        this.#dataView.setInt16(this.#position, value);
        this.#position += Int16Array.BYTES_PER_ELEMENT;
        break;
      case 'uint16':
        this.#checkBufferLength(Uint16Array.BYTES_PER_ELEMENT);
        this.#dataView.setUint16(this.#position, value);
        this.#position += Uint16Array.BYTES_PER_ELEMENT;
        break;
      case 'int32':
        this.#checkBufferLength(Int32Array.BYTES_PER_ELEMENT);
        this.#dataView.setInt32(this.#position, value);
        this.#position += Int32Array.BYTES_PER_ELEMENT;
        break;
      case 'uint32':
        this.#checkBufferLength(Uint32Array.BYTES_PER_ELEMENT);
        this.#dataView.setUint32(this.#position, value);
        this.#position += Uint32Array.BYTES_PER_ELEMENT;
        break;
      case 'int64':
        this.#checkBufferLength(BigInt64Array.BYTES_PER_ELEMENT);
        this.#dataView.setBigInt64(this.#position, value);
        this.#position += BigInt64Array.BYTES_PER_ELEMENT;
        break;
      case 'uint64':
        this.#checkBufferLength(BigUint64Array.BYTES_PER_ELEMENT);
        this.#dataView.setBigUint64(this.#position, value);
        this.#position += BigUint64Array.BYTES_PER_ELEMENT;
        break;
      case 'float32':
        this.#checkBufferLength(Float32Array.BYTES_PER_ELEMENT);
        this.#dataView.setFloat32(this.#position, value);
        this.#position += Float32Array.BYTES_PER_ELEMENT;
        break;
      case 'float64':
        this.#checkBufferLength(Float64Array.BYTES_PER_ELEMENT);
        this.#dataView.setFloat64(this.#position, value);
        this.#position += Float64Array.BYTES_PER_ELEMENT;
        break;
      case 'datetime':
        this.#encodeDate(options, value);
        break;
      case 'binary':
        this.#encodeBinary(options, value);
        break;
      default:
        throw new Error(`Built-In type ${type} not handled`);
      }
    } else {
      //look to the definitions
      //assume it's been validated
      const def = this.#definitions[type];
      if (typeof (def) === 'undefined')
        throw new Error(`${type} is not defined`);
      if (def.type === 'complex') {
        const schema = def.schema;
        for (let schemaComponentName in schema) {
          const schemaComponent = schema[schemaComponentName];
          if (typeof (value) === 'undefined' || value === null)
            value = {};
          this.#encodeComponent(schemaComponent.type, schemaComponent.options, value[schemaComponentName])
        }
      } else if (BinaryPacker.#builtInDefs.includes(def.type)) {
        return this.#encodeComponent(def.type, def.options, value);
      } else
        throw new Error(`${def.type} type not yet defined`);
    }
  }

  /**
   * Decode a value according to the given options
   * @function #decodeComponent
   * @memberof BinaryPacker
   * @private
   * @param {string} type Eecoding type to be decoded
   * @param {Options} options Option of the decoding
   * @returns {*}
   */
  #decodeComponent(type, options) {
    if (BinaryPacker.#builtInDefs.includes(type)) {
      switch (type) {
      case 'array':
        return this.#decodeArray(options);
        break;
      case 'string':
        return this.#decodeString(options);
        break;
      case 'int8': {
        const value = this.#dataView.getInt8(this.#position);
        this.#position += Int8Array.BYTES_PER_ELEMENT;
        return value;
        break;
      }
      case 'uint8': {
        const value = this.#dataView.getUint8(this.#position);
        this.#position += Uint8Array.BYTES_PER_ELEMENT;
        return value;
        break;
      }
      case 'int16': {
        const value = this.#dataView.getInt16(this.#position);
        this.#position += Int16Array.BYTES_PER_ELEMENT;
        return value;
        break;
      }
      case 'uint16': {
        const value = this.#dataView.getUint16(this.#position);
        this.#position += Uint16Array.BYTES_PER_ELEMENT;
        return value;
        break;
      }
      case 'int32': {
        const value = this.#dataView.getInt32(this.#position);
        this.#position += Int32Array.BYTES_PER_ELEMENT;
        return value;
        break;
      }
      case 'uint32': {
        const value = this.#dataView.getUint32(this.#position);
        this.#position += Uint32Array.BYTES_PER_ELEMENT;
        return value;
        break;
      }
      case 'int64': {
        const value = this.#dataView.getBigInt64(this.#position);
        this.#position += BigInt64Array.BYTES_PER_ELEMENT;
        return value;
        break;
      }
      case 'uint64': {
        const value = this.#dataView.getBigUint64(this.#position);
        this.#position += BigUint64Array.BYTES_PER_ELEMENT;
        return value;
        break;
      }
      case 'float32': {
        const value = this.#dataView.getFloat32(this.#position);
        this.#position += Float32Array.BYTES_PER_ELEMENT;
        return value;
        break;
      }
      case 'float64': {
        const value = this.#dataView.getFloat64(this.#position);
        this.#position += Float64Array.BYTES_PER_ELEMENT;
        return value;
        break;
      }
      case 'datetime':
        return this.#decodeDate(options);
        break;
      case 'binary':
        return this.#decodeBinary(options);
        break;
      default:
        throw new Error(`Built-In type ${type} not handled`);
      }
    } else {
      //look to the definitions
      //assume it's been validated
      const def = this.#definitions[type];
      if (def.type === 'complex') {
        const object = {};
        const schema = def.schema;
        for (let schemaComponentName in schema) {
          const schemaComponent = schema[schemaComponentName];
          object[schemaComponentName] = this.#decodeComponent(schemaComponent.type, schemaComponent.options)
        }
        return object;
      }
      if (BinaryPacker.#builtInDefs.includes(def.type)) {
        return this.#decodeComponent(def.type, def.options);
      } else
        throw new Error(`${def.type} type not yet defined`);

    }
  }
  //end built-ins

  //public methods
  /**
   * Builds a BinaryPacker object with a given mapping
   * @constructor
   * @param {Mapping} mapping Mapping object describing how encode/decode data
   * @returns {BinaryPacker}
   */
  constructor(mapping) {

    this.#readDefintions(mapping.definitions);
    if (this.#validateSchema(mapping.schema) === false) {
      throw new Error('Validation failed');
    }
    this.#schema = mapping.schema;
  }

  /**
   * Encodes an object to the pre-supplied mapping
   * @param {Object} object Object to be encoded
   * @returns {ArrayBuffer}
   */
  encode(object) {
    this.#buffer = new ArrayBuffer(1);
    this.#dataView = new DataView(this.#buffer);

    const schema = this.#schema;
    this.#position = 0;
    for (let schemaComponentName in schema) {
      const schemaComponent = this.#schema[schemaComponentName];
      this.#encodeComponent(schemaComponent.type, schemaComponent.options, object[schemaComponentName])
    }
    this.#shrinkBuffer(this.#position);
    return this.#buffer;
  }

  /**
   * Decodes an object to the pre-supplied mapping
   * @param {ArrayBuffer} buffer to decode
   * @returns {Object}
   */
  decode(arrayBuffer) {
    if ((arrayBuffer instanceof ArrayBuffer) !== true) throw new TypeError('input was not of type ArrayBuffer');
    this.#buffer = arrayBuffer;
    this.#dataView = new DataView(this.#buffer);
    const resultObject = {};
    const schema = this.#schema;
    this.#position = 0;
    for (let schemaComponentName in schema) {
      const schemaComponent = this.#schema[schemaComponentName];
      resultObject[schemaComponentName] = this.#decodeComponent(schemaComponent.type, schemaComponent.options);
    }
    return resultObject;
  }

}

Object.freeze(BinaryPacker);

export {
  BinaryPacker
}
export default BinaryPacker;
