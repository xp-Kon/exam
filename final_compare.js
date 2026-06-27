const fs = require('fs');
const content = fs.readFileSync('js/data.js', 'utf-8');
eval(content.replace(/^const /gm, 'var '));

const qs = SUBJECTS.jsp.questions;
console.log(`data.js JSP questions: ${qs.length}`);

// Output all JSP questions as JSON for Python to compare
const output = qs.map(q => ({
    id: q.id,
    question: q.question,
    options: q.options,
    answer: q.answer,
    type: q.type
}));
fs.writeFileSync('jsp_datajs.json', JSON.stringify(output, null, 2), 'utf-8');
console.log('Written to jsp_datajs.json');
