const { parseWordleSummary } = require('./dist/core/parser');

const actualMessages = [
  `Your group is on a 1 day streak! 🔥 Here are yesterday's results:
👑 4/6: @jiunee
5/6: @jiawen @ploopy
6/6: @Zahir Hassan`,

  `Your group is on a 2 day streak! 🔥 Here are yesterday's results:
👑 3/6: @anika
4/6: @jiawen
5/6: @bonsen @zahir
X/6: @jiunee`,

  `Your group is on a 3 day streak! 🔥 Here are yesterday's results:
👑 3/6: @anika
4/6: @jiawen
6/6: @jiunee`,

  `Your group is on a 4 day streak! 🔥 Here are yesterday's results:
👑 3/6: @jiawen @bonnie
4/6: @anika
5/6: @jiunee`,

  `Your group is on a 5 day streak! 🔥 Here are yesterday's results:
👑 3/6: @bonsen @anika @jiunee @jiawen`,

  `Your group is on a 6 day streak! 🔥 Here are yesterday's results:
👑 2/6: @jiawen
3/6: @anika @bonsen
5/6: @jiunee`
];

console.log('=== TESTING ACTUAL MESSAGES ===');
actualMessages.forEach((msg, i) => {
  console.log(`\n--- Message ${i + 1} ---`);
  console.log(msg);
  const result = parseWordleSummary(msg);
  if (result) {
    console.log(`✅ PARSED: ${result.entries.length} entries`);
    result.entries.forEach(e => {
      console.log(`  ${e.userId}: ${e.failed ? 'X' : e.guesses}/6`);
    });
  } else {
    console.log('❌ FAILED TO PARSE');
  }
});

// Let's check what each line is being matched
console.log('\n=== LINE BY LINE ANALYSIS ===');
const testMsg = actualMessages[0];
const lines = testMsg.split(/\r?\n/);
lines.forEach((line, i) => {
  const trimmed = line.trim();
  console.log(`Line ${i}: "${trimmed}"`);
  
  // Test the regexes
  const LINE_WIN_PREFIX = /(^|\s)([1-6])\/6\s*:\s*/i;
  const LINE_FAIL_PREFIX = /(^|\s)X\/6\s*:\s*/i;
  
  if (LINE_WIN_PREFIX.test(trimmed)) {
    const match = LINE_WIN_PREFIX.exec(trimmed);
    console.log(`  ✅ WIN MATCH: score=${match[2]}`);
  } else if (LINE_FAIL_PREFIX.test(trimmed)) {
    console.log(`  ✅ FAIL MATCH`);
  } else {
    console.log(`  ❌ NO MATCH`);
  }
});
