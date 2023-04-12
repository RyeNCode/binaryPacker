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
   * @private
   */
  #buffer = null;
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
    'int8', 'uint8', 'uint8clamped',
    'int16', 'uint16',
    'int32', 'uint32',
    'int64', 'uint64',
    'float32', 'float64',
    'datetime'
  ];

  /**
   * Internal map of encoding types to TypedArray constructor
   * @private
   */
  static #numberMap = {
    "int8": Int8Array,
    "uint8": Uint8Array,
    "uint8clamped": Uint8ClampedArray,
    "int16": Int16Array,
    "uint16": Uint16Array,
    "int32": Int32Array,
    "uint32": Uint32Array,
    "int64": BigInt64Array,
    "uint64": BigUint64Array,
    "float32": Float32Array,
    "float64": Float64Array,
  };

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
    if (this.#pendingDefinitions.length > 0) {
      console.error(`undefined types: [${this.#pendingDefinitions.join(",")}]`);
      throw new Error(`undefined types referenced`);
    }
    //every type must be defined
    if (typeof (schema) === 'undefined' || schema === null) return false;
    for (let mapName in schema) {
      const map = schema[mapName];
      //todo
      const type = map.type === "array" ? map.options.type : map.type;
      if (BinaryPacker.#builtInDefs.includes(type)) continue; //ok
      if (this.#definitions.hasOwnProperty(type)) continue; //ok
      console.error(`${type} is not defined`)
      return false;
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

      if (defObj.type === "complex") {
        //recurse
        this.#definitions[defProp] = defObj;
        this.#readDefintions(defObj.schema);
      } else if (defObj.type === "array") {
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
    } else {
      //create new buffer, transfer stuff to it and return that.
      const newBuffer = new ArrayBuffer(newSize);
      new Uint8Array(newBuffer).set(new Uint8Array(this.#buffer));
      this.#buffer = newBuffer;

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

    if (value instanceof Date === false) throw new Error("not a Date");
    const epochDate = BigInt(value.getTime());
    this.#encodeNumber(BigUint64Array, null, epochDate);
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
    const epochDate = Number(this.#decodeNumber(BigUint64Array, null));
    console.log(`Decoded Date: ${epochDate}`);
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
    if (Array.isArray(value) === false) throw new Error("element is not an array");
    //encode the size of the array (number of elements)
    this.#encodeNumber(Uint32Array, {}, value.length);
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
    this.#byteAlignAdj(Uint32Array.BYTES_PER_ELEMENT);
    const arrayLength = this.#decodeNumber(Uint32Array, {});
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
    this.#encodeNumber(Uint32Array, null, encoded.length)
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
    const size = this.#decodeNumber(Uint32Array, null);
    const stringBuf = new Uint8Array(this.#buffer, this.#position, size);
    this.#position += size;
    const result = new TextDecoder().decode(stringBuf);
    if (options) {
      if (typeof (options.content) !== 'undefined' && options.content !== null) {
        //has defined content, must match.
        if (result !== options.content)
          throw new Error("string content doesn't match schema definition");
      }
    }
    return result;
  }

  /**
   * Encodes a given number
   * @function #encodeNumber
   * @memberof BinaryPacker
   * @private   
   * @param {function(new:TypedArray)} arrayType constructor for a given TypedArray
   * @param {NumberOptions} options options for encoding
   * @param {number} value numeric value to encode
   */
  #encodeNumber(arrayType, options, value) {
    this.#byteAlignAdj(arrayType.BYTES_PER_ELEMENT);
    //check buffer length
    this.#checkBufferLength(arrayType.BYTES_PER_ELEMENT);
    const sizeBuf = new arrayType(this.#buffer, this.#position, 1);
    sizeBuf.set([value]);
    this.#position += arrayType.BYTES_PER_ELEMENT;
  }
  /**
   * Decodes a numeric value
   * @function #decodeNumber
   * @memberof BinaryPacker
   * @private
   * @param {function(new:TypedArray)} arrayType constructor for a given TypedArray
   * @param {NumberOptions} options options for encoding
   * @returns {number}
   */
  #decodeNumber(arrayType, options) {
    this.#byteAlignAdj(arrayType.BYTES_PER_ELEMENT);
    const result = new arrayType(this.#buffer, this.#position, 1)[0];
    this.#position += arrayType.BYTES_PER_ELEMENT;
    return result;
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
      case "array":
        this.#encodeArray(options, value);
        break;
      case "string":
        this.#encodeString(options, value);
        break;
      case "int8":
      case "uint8":
      case "uint8clamped":
      case "int16":
      case "uint16":
      case "int32":
      case "uint32":
      case "int64":
      case "uint64":
      case "float32":
      case "float64":
        this.#encodeNumber(BinaryPacker.#numberMap[type], options, value);
        break;
      case "datetime":
        this.#encodeDate(options, value);
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
      if (def.type === "complex") {
        const schema = def.schema;
        for (let schemaComponentName in schema) {
          const schemaComponent = schema[schemaComponentName];
          if (typeof (value) === "undefined" || value === null)
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
      case "array":
        return this.#decodeArray(options);
        break;
      case "string":
        return this.#decodeString(options);
        break;
      case "int8":
      case "uint8":
      case "uint8clamped":
      case "int16":
      case "uint16":
      case "int32":
      case "uint32":
      case "int64":
      case "uint64":
      case "float32":
      case "float64":
        return this.#decodeNumber(BinaryPacker.#numberMap[type], options);
        break;
      case "datetime":
        return this.#decodeDate(options);
        break;
      default:
        throw new Error(`Built-In type ${type} not handled`);
      }
    } else {
      //look to the definitions
      //assume it's been validated
      const def = this.#definitions[type];
      if (def.type === "complex") {
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
      throw new Error("Validation failed");
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
   * @returns {Object}
   */
  decode() {
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
