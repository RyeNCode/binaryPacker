import BinaryPacker from '../binarypacker.mjs';

describe("binary", function () {
  it("binary", function () {
    const schema = {
      schema: {
        binaryData: { type: "binary" }
      }
    };

    const data = [12345, 123456]
    const sourceBuffer = new ArrayBuffer(8);
    const dataArray = new Int32Array(sourceBuffer);
    dataArray.set(data);
    const obj = {
      binaryData: dataArray.buffer
    };
    const bp = new BinaryPacker(schema);
    const bin = bp.encode(obj);
    const res = bp.decode(bin);

    expect(res.binaryData).toEqual(sourceBuffer);
  });

});
