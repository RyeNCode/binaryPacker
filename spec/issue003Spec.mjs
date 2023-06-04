import BinaryPacker from '../binarypacker.mjs';

/* identified by https://github.com/RyeNCode/binaryPacker/issues/3 */
describe("issues", function () {
  it("003 - schema validation error detail", function () {
    const schema = {
      'definitions': {
        'static': {
          'type': 'string',
          'options': { 'content': 'Content' }
        }
      },
      'schema': {
        'staticContent': { 'type': 'static' }
      }
    };

    const bp1 = new BinaryPacker(schema);
    const encoded = bp1.encode({});
    bp1.decode(encoded); //Works Correctly
    var bp2 = new BinaryPacker(schema);
    bp2.decode(encoded); //failed

  });
});
