import BinaryPacker from '../binarypacker.mjs';

/* identified by https://github.com/RyeNCode/binaryPacker/issues/4 */
describe("issues", function () {
  it("004 - content across two instances doesn't match", function () {
    const schema = {
      'definitions': {
        'static': {
          'type': 'string',
          'options': { 'content': 'Content' }
        },
        'definitions': {type:'sd'}
      },
      'schema': {
        'staticContent': { 'type': 'static' },
        'badType':{'type':'bob'}
      }
    };

    const bp1 = new BinaryPacker(schema);

  });
});
