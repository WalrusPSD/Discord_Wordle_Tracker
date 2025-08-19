const { openDb, getAlias, listAliases } = require('./dist/core/db');

const db = openDb();
console.log('All aliases in DB:');
console.log(listAliases(db));

console.log('\nTesting specific lookups:');
const tests = ['@zahir', '@zahir hassan', '@anika', '@jiunee'];
tests.forEach(test => {
  const result = getAlias(db, test);
  console.log(`${test} -> ${result}`);
});
