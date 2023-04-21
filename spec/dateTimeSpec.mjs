import BinaryPacker from '../binarypacker.mjs';

describe("datetime", function () {
  it("datetime", function () {
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
    const res = bp.decode(bin);

    expect(res.date).toEqual(dateTimeVal);
  });

});
