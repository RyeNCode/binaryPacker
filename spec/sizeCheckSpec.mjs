import BinaryPacker from '../binarypacker.mjs';

describe("sizecheck", function () {
  xit("sizecheck", function () {
    const schema = {
      schema: {
        date: { type: "datetime" },
        number: { type: "uint32" }
      }
    };

    const dateTimeVal = new Date();
    const obj = {
      date: dateTimeVal,
      number: dateTimeVal
    };
    const bp = new BinaryPacker(schema);
    const bin = bp.encode(obj);
    const stringified = JSON.stringify(obj, null, null);

    const encoded = new TextEncoder().encode(stringified);

  });

});
