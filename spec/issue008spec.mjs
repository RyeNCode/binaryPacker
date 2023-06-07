import BinaryPacker from '../binarypacker.mjs';

/* identified by https://github.com/RyeNCode/binaryPacker/issues/4 */
describe("issues", function () {
  it("008 - check endianness, new DataView", function () {

    // this is due to the test pulling back a float that is the best binary rep of 
    // the input, which doesn't match the input.
    var dv = new DataView(new ArrayBuffer(4));
    dv.setFloat32(0, 4563.24);
    const inexactFloat = dv.getFloat32(0);

    const schema = {
      'schema': {
        'int8': {'type':'int8'},
        'uint8': {'type':'uint8'},
        'int16': {'type':'int16'},
        'uint16': {'type':'uint16'},
        'int32': {'type':'int32'},
        'uint32': {'type':'uint32'},
        'int64': {'type':'int64'},
        'uint64': {'type':'uint64'},
        'float32': {'type':'float32'},
        'float64': {'type':'float64'},
        'datetime': {'type': 'datetime'}
      }
    };

    const bp1 = new BinaryPacker(schema);
    const bp2 = new BinaryPacker(schema);

    const srcObj = {
        'int8': 23,
        'uint8': 3,
        'int16': 43,
        'uint16': 134,
        'int32': 113,
        'uint32': 8181,
        'int64': BigInt(818122),
        'uint64': BigInt(23123),
        'float32': inexactFloat,
        'float64': 456.212337,
        'datetime': new Date()
    }

    const buffer = bp1.encode(srcObj);

    const dstObj = bp2.decode(buffer);

    expect(dstObj).toEqual(srcObj);


  });
});
