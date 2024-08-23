const fs = require('fs');
const path = require('path');

module.exports = function loadBadWords() {
  const badWordsFilePath = path.join(__dirname, '../data/formatted_badwords.txt');
  const badWordsContent = fs.readFileSync(badWordsFilePath, 'utf-8');
  return badWordsContent.split(',').map(word => word.trim().replace(/['"]+/g, ''));
};
