import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { seedContent } from './contentSeed.js';

await connectDb();
console.log('Content seeded (existing pages untouched):', await seedContent());
await mongoose.disconnect();
