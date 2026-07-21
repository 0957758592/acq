import mongoose from 'mongoose';

let connected = false;

export async function connectMongo(uri) {
  if (connected) return mongoose.connection;
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  connected = true;
  return mongoose.connection;
}

export async function disconnectMongo() {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}
