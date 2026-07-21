export function dotProduct(left = [], right = []) {
  const limit = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < limit; index += 1) {
    sum += Number(left[index] || 0) * Number(right[index] || 0);
  }
  return sum;
}

export function vectorMagnitude(vector = []) {
  return Math.sqrt(dotProduct(vector, vector));
}

export function cosineSimilarity(left = [], right = []) {
  const leftMagnitude = vectorMagnitude(left);
  const rightMagnitude = vectorMagnitude(right);
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dotProduct(left, right) / (leftMagnitude * rightMagnitude);
}

export function rankByCosineSimilarity(queryVector = [], entries = [], vectorSelector = (entry) => entry) {
  return [...entries]
    .map((entry) => ({
      entry,
      score: cosineSimilarity(queryVector, vectorSelector(entry) || [])
    }))
    .sort((left, right) => right.score - left.score);
}
