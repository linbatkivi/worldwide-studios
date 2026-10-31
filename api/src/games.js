'use strict';
// De spil der må gemme data i skyen. Tilføj et nyt spil her, så virker kontoen med det.
module.exports = {
  'white-dust': { name: 'White Dust', maxSaveBytes: 256 * 1024 },
  'complex': { name: 'Complex', maxSaveBytes: 256 * 1024 },
  'blindline': { name: 'Blindline', maxSaveBytes: 256 * 1024 },
  'freefall': { name: 'Freefall', maxSaveBytes: 256 * 1024 },
  // scores: spillet har en rangliste. maxMs er den længste tid en enkelt runde kan have.
  'flugt': { name: 'Flugt', maxSaveBytes: 256 * 1024, scores: { maxMs: 6 * 3600e3 } }
};
