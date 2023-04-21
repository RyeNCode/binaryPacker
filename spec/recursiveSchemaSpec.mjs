import BinaryPacker from '../binarypacker.mjs';

const mySchema = {
  "definitions": {
    "name": { "type": "string" },
    "person": {
      "type": "complex",
      "schema": {
        "firstName": { "type": "name" },
        "middleName": { "type": "name" },
        "lastName": { "type": "name" },
        "friends": { "type": "personList" }
      }
    },
    "personList": {
      "type": "array",
      "options": { "type": "person" }
    }
  },
  "schema": {
    "attendees": { "type": "personList" }
  }
}


const myDataObj = {
  "attendees": [
    { fistName: "Bob", lastName: "Ratchet" },
    {
      fistName: "Stan",
      middleName: "Frum",
      lastName: "Winston",
      friends: [
        { fistName: "Bill", lastName: "Manly" }
      ]
    }
  ]
};

describe("schema", function () {
  xit("recusive schema", function () {
    const myDataObj = {
      "attendees": [
        { fistName: "Bob", lastName: "Ratchet" },
        {
          fistName: "Stan",
          middleName: "Frum",
          lastName: "Winston",
          friends: [
            { fistName: "Bill", lastName: "Manly" }
          ]
        }
      ]
    };
    const bp = new BinaryPacker(mySchema);
    const bin = bp.encode(myDataObj);
    const result = bp.decode(bin);
  });
  xit("recusive data (not implemented)", function () {
    const myDataObj = {
      "attendees": [
        { fistName: "Bob", lastName: "Ratchet", friends: [] },
        {
          fistName: "Stan",
          middleName: "Frum",
          lastName: "Winston",
          friends: [
            { fistName: "Bill", lastName: "Manly", friends: [] }
          ]
        }
      ]
    };
    //console.warn(myDataObj.attendees);
    myDataObj.attendees[0].friends[0] = myDataObj.attendees[0];
    const bp = new BinaryPacker(mySchema);
    const bin = bp.encode(myDataObj);
    const result = bp.decode(bin);
  });
});
