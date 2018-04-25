'use strict';

console.log('HELLO THERE! THIS IS LOG OF A STRING');
setTimeout(function () {
  return console.log('ANOTHER MESSAGE!', { and: 'An object' });
}, 5000);