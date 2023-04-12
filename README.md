# BinaryPacker
BinaryPacker is a utility to serialize a JavaScript object into an ArrayBuffer according to a provided schmea and deserialize an ArrayBuffer according to a given schema.
Sending binary data across a socket or in a file will likely be much more size efficient than a stringified version of the data.
Being able to define a schema for a binary data type or document saves the developer the stress of manually having to serialize and deserialize each component by hand.

## Installation
`npm install @ryencode/binarypacker`
## Using BinaryPacker
### Basic usage
The following example assumes a schema has been defined.
```js
const bp = new BinaryPacker(mySchema);

//encoding
const binary = bp.encode(inObject);

//decoding
const outObject = bp.decode(binary);
```
### Defining a Schema
A schema is a JavaScript `Object` that details how to encode/decode the object to and from the binary representation.

```js
const mySchmea = {
  definitions:{
	  customA: {
		  type: "string",
		  options: {content:"staticValue"}
		},
		customB:{
			type:"complex",
			schema:{
				customASubProp: "string"
			}
		}
  },
  schema:{
		stringProp:{type:"string"},
		numberProp:{type:"uint16"},
		customAProp:{type:"customA"},
		customBProp:{type:"customB"},
		arrayProp:{
			type:"array",
			options:{type:"string"}
		}
  }
}
```
The above schema describes a serialization scheme for objects that look like the following:
```js
{
	stringProp: "string a",
	numberProp: 3139,
	customAProp: "staticValue",
	customBProp: {
		customASubProp: "string b"
	},
	arrayProp: ["A","B","C"]
}
```
#### Schema Type
A schema type has a `type` property which must be one of the supported internal types, or a type defined in the Definitions section of the schema object.
Optionally an `options` object may be passed in to provided extra details to the serialization/serialization processes. The specifics of the `options` depends on the `type` used.
```js
{
	type: "type",
	options: {...}
}
```

#### Definitions
It is possible to create complex hierarchies by defining your own types within the `definitions` section of the schema object.
##### Alias an existing type with specific options
Define the type
```js
const mySchema = {
  definitions: {
		typeName: {
			type: "stirng",
			options: { content:"Always This Value" }
		}
	}
	...
}
```
Using the type:
```js
const mySchema = {
	...
	schmea: {
		//the following uses the options from the defined types above
		myProp: {type: "typeName"}
		
	}
}
```
##### Define a complex type
```js
const mySchema = {
  "definitions":{
    "name": { "type":"string"},
    "person": {
      "type": "complex",
      "schema": {
        "firstName": {"type": "name"},
        "middleName": {"type": "name"},
        "lastName": {"type": "name"},
        "friends": {"type": "personList"}
      }
    },
    "personList": {
      "type": "array",
      "options": {"type": "person"}
    }
  },
  "schema": {
    "attendees": { "type": "personList"  }
  }
}
```
##### Data working with schema
```js
const myDataObj = {
	"attendees": [
		{fistName:"Bob", lastName:"Ratchet"},
		{fistName:"Stan", middleName: "Frum", lastName:"Winston",
			friends:[
			  {fistName:"Bill", lastName:"Manly"}
			]
		}
	]
};
```
*Currently recursive data is NOT supported and will cause a stack overload*

### Supported Types
|Type|bytes|Details|
|--|--|--|
|string|4+|4 bytes for the length of the string then the encoded bytes for the string.|
|array|4+|4 bytes for the length of the string then the bytes for each element|
|int8|1|Signed 8bit integer|
|uint8|1|Unsigned 8bit integer|
|uint8clamped|1|Unsigned clamped 8bit integer|
|int16|2|Signed 16bit integer|
|uint16|2|Unsigned 16bit integer|
|int32|4|Signed 32bit integer|
|uint32|4|Unsigned 32bit integer|
|int64|8|Signed 64bit integer as BigInt|
|uint64|8|Unsigned 64bit integer as BigInt|
|float32|4|Signed 32bit floating point|
|float64|8|Signed 64bit floating point|
|datetime|8|Date object (internally stores the getTime() result as a uint64 value)|

#### String
String type supports options
|Option|Description|
|--|--|
|content|Fixed content written to the binary stream, and verified on read.|

#### Array
String type supports options
|Option|Description|
|--|--|
|type|**Required** The type of each element in the array. An array can only have one element type.|

## Contributing
### Coding Standards
Have you looked at the code? No standard here.
OK committed code should be beautified, and should have relevant tests added and existing tests passed. If an existing test no longer passes it should be because the existing test is no longer relevant and thus removed or altered to be correct. And updated documentation (using JSDoc please.)

I make no promise of reviewing pull requests or answering questions on why one may be rejected or not. Though I will try to deal with these in a timely and respectful manner.

## Copyright & License
### Copyright
All files and content Copyright 2023 Ryan Brown (ryan[at]lightdeprived[dot]net)
### License
[GNU General Public License v3.0](https://choosealicense.com/licenses/gpl-3.0/)

> Written with [StackEdit](https://stackedit.io/).
