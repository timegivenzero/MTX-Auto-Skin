import Benchmark from 'benchmark';
import dataschema from "./src/dataschema"

var suite = new Benchmark.Suite;

const schema = require("./tests/data/skychangeschema.json");
const data = Buffer.from(require("./tests/data/skychangeresult.json"));
const obj = require("./tests/data/skychangeobj.json");
// add tests
suite.add('parse', function() {
  dataschema.parse(schema, data, 0);
})
  .add('calculate', function() {
    dataschema.calculateDataLength(schema, obj);
  })
  .add('pack', function() {
    dataschema.pack(schema, obj);
  })
  // add listeners
  .on('cycle', function(event: any) {
    console.log(String(event.target));
  })
  // run async
  .run({ 'async': false });
