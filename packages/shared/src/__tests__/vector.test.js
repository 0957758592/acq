import { cosineSimilarity, dotProduct, rankByCosineSimilarity, vectorMagnitude } from '../index.js';

test('computes dot product and magnitude', () => {
  expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
  expect(vectorMagnitude([3, 4])).toBe(5);
});

test('computes cosine similarity safely', () => {
  expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
  expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  expect(cosineSimilarity([], [1, 2])).toBe(0);
});

test('ranks entries by cosine similarity', () => {
  const ranked = rankByCosineSimilarity(
    [1, 0],
    [
      { id: 'far', vector: [0, 1] },
      { id: 'near', vector: [1, 0] }
    ],
    (entry) => entry.vector
  );

  expect(ranked[0].entry.id).toBe('near');
});
