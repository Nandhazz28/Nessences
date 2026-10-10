// Development seed. Inserts real documents into MongoDB; the app only ever reads them through the API.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { StaffUser } from '../models/StaffUser.js';
import { Category } from '../models/Category.js';
import { Collection } from '../models/Collection.js';
import { Product } from '../models/Product.js';
import { ProductVariant } from '../models/ProductVariant.js';
import { Inventory } from '../models/Inventory.js';
import { Coupon } from '../models/Coupon.js';
import { hashPassword } from '../services/authService.js';
import { syncProductFacets } from '../services/inventoryService.js';
import { slugify } from '../utils/slug.js';
import { seedContent } from './contentSeed.js';

if (env.isProd && !process.argv.includes('--force')) {
  console.error('Refusing to seed in production. Pass --force if you really mean it.'); process.exit(1);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', '..', 'uploads', 'seed');
fs.mkdirSync(outDir, { recursive: true });

const COLORS = {
  Ecru: '#E6DFCB', Ink: '#181510', Oxblood: '#6E2A2A', Olive: '#555B3E', Stone: '#CFC8B6',
  Charcoal: '#3B3A38', Sand: '#D6C6A2', Rinse: '#41566F', Tan: '#9A6B44',
};
const darkish = (hex) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) < 110; };

// Line-art silhouettes (viewBox 400x500), same editorial language as the Nessence design reference.
const SHAPES = {
  dresses: 'M170 70 L148 120 L160 150 L112 440 L288 440 L240 150 L252 120 L230 70 Q200 112 170 70Z',
  jackets: 'M150 70 L96 108 L78 330 L112 336 L118 450 L282 450 L288 336 L322 330 L304 108 L250 70 L200 130Z M200 130 L200 450',
  shirts: 'M150 80 L88 122 L112 182 L142 160 L142 410 L258 410 L258 160 L288 182 L312 122 L250 80 Q200 118 150 80Z M200 108 L200 410',
  't-shirts': 'M150 90 L84 128 L110 184 L140 164 L140 400 L260 400 L260 164 L290 184 L316 128 L250 90 Q200 126 150 90Z',
  tops: 'M156 90 L96 130 L118 184 L144 166 L144 380 L256 380 L256 166 L282 184 L304 130 L244 90 Q200 128 156 90Z',
  knitwear: 'M150 84 L84 130 L104 220 L142 204 L142 410 L258 410 L258 204 L296 220 L316 130 L250 84 Q200 112 150 84Z',
  trousers: 'M138 70 L262 70 L292 440 L214 440 L200 190 L186 440 L108 440Z',
  denim: 'M138 70 L262 70 L286 440 L216 440 L200 200 L184 440 L114 440Z M138 70 L262 70 L262 96 L138 96Z',
  footwear: 'M78 330 L170 330 L196 284 L322 336 Q340 376 304 388 L78 388Z',
  accessories: 'M70 236 L330 236 L330 266 L70 266Z M176 226 L224 226 L224 276 L176 276Z',
};
function writeSvg(file, shape, hex, zoom) {
  const stroke = darkish(hex) ? '#E9E4D8' : '#181510';
  const vb = zoom ? '110 60 180 225' : '0 0 400 500';
  fs.writeFileSync(path.join(outDir, file), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="800" height="1000"><rect x="-50" y="-50" width="600" height="700" fill="${darkish(hex) ? '#2A2722' : '#EFEAE0'}"/><path d="${shape}" fill="${hex}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/></svg>`);
}

const APPAREL = ['XS', 'S', 'M', 'L', 'XL'];
const SIZES = { trousers: ['30', '32', '34', '36'], denim: ['30', '32', '34', '36'], footwear: ['6', '7', '8', '9', '10'], accessories: ['One Size'] };
const CARE = {
  wool: ['Dry clean only', 'Do not tumble dry', 'Store folded or on a wide hanger'],
  cotton: ['Machine wash cold with like colours', 'Cool iron on reverse', 'Do not bleach'],
  silk: ['Dry clean recommended', 'Cool iron on reverse if needed', 'Keep away from direct sunlight'],
  leather: ['Wipe with a soft dry cloth', 'Condition occasionally', 'Store with shoe trees or tissue'],
  linen: ['Machine wash cold, gentle cycle', 'Line dry', 'Iron damp for a crisp finish'],
  denim: ['Wash inside out, cold', 'Wash rarely', 'Line dry'],
};
const FABRIC = {
  wool: '100% virgin wool, Italian mill', merino: '100% extra-fine merino wool', cotton: '100% long-staple cotton',
  silk: '100% mulberry silk', satin: '96% recycled polyester, 4% elastane', linen: '100% European flax linen',
  denim: '100% organic cotton, 12oz', leather: 'Full-grain leather upper, leather lining', crepe: '100% viscose crepe',
};
const careKey = { merino: 'wool', satin: 'silk', crepe: 'silk' };

const CATEGORIES = [
  ['Dresses', ['women']], ['Tops', ['women']], ['Shirts', ['men']], ['T-Shirts', ['men']], ['Knitwear', ['men', 'women']],
  ['Jackets', ['men', 'women']], ['Trousers', ['men', 'women']], ['Denim', ['men', 'women']],
  ['Footwear', ['men', 'women']], ['Accessories', ['men', 'women']],
];
const COLLECTIONS = [
  ['Autumn/Winter 026', 'Unfussy tailoring, weighted knits and coats built to outlast the trend cycle.', 'AW26', true],
  ['Layered Wool', 'Wool in three weights, cut to be worn over and under each other.', 'AW26', false],
  ['Quiet Evening', 'Bias-cut satins and crepes for evenings that do not need a performance.', 'AW26', false],
  ['Structured Tailoring', 'Clean lines, considered shoulders, trousers that hold their crease.', 'Core', false],
];

// name, gender, category, price(INR), sale(INR|0), colours, collection, fabric, blurb, [newArrival]
const P = [
  ['Bias Slip Dress', 'women', 'dresses', 9400, 0, ['Ecru', 'Ink', 'Oxblood'], 'Quiet Evening', 'satin', 'A bias-cut slip in a weighted matte satin that skims rather than clings. Adjustable straps, a low cowl back and a hem that falls just below the knee.', 1],
  ['Poplin Shirt Dress', 'women', 'dresses', 8200, 0, ['Stone', 'Ink'], 'Structured Tailoring', 'cotton', 'A crisp shirt dress in dense cotton poplin with a concealed placket and a slightly dropped shoulder.'],
  ['Ribbed Midi Dress', 'women', 'dresses', 7100, 5680, ['Olive', 'Ink'], 'Layered Wool', 'merino', 'A fine-rib merino knit dress with a high neck and a column silhouette that moves with you.'],
  ['Draped Column Gown', 'women', 'dresses', 16800, 0, ['Ink'], 'Quiet Evening', 'crepe', 'A floor-length crepe gown with a softly draped neckline and a clean, straight column skirt.'],
  ['Satin Cowl Slip', 'women', 'dresses', 8900, 0, ['Oxblood', 'Ink'], 'Quiet Evening', 'satin', 'A cowl-neck slip with a hand-rolled hem, cut on the bias for fluid movement.', 1],
  ['Linen Shirt Dress', 'women', 'dresses', 7600, 0, ['Ecru'], 'Structured Tailoring', 'linen', 'A relaxed shirt dress in washed European linen with deep side pockets and a self-belt.'],
  ['Merino Wrap Dress', 'women', 'dresses', 8400, 0, ['Stone', 'Olive'], 'Layered Wool', 'merino', 'A wrap dress in a smooth merino jersey with a defined waist tie and long sleeves.'],
  ['Silk Bias Gown', 'women', 'dresses', 18900, 0, ['Ecru'], 'Quiet Evening', 'silk', 'A mulberry silk gown cut on the bias with an open back and a long, fluid hem.'],
  ['Crepe Slip Dress', 'women', 'dresses', 9900, 0, ['Ink'], 'Quiet Evening', 'crepe', 'A minimal crepe slip with narrow straps and a straight midi length.', 1],
  ['Silk Camisole', 'women', 'tops', 4900, 0, ['Ecru', 'Ink'], 'Quiet Evening', 'silk', 'A bias-cut silk camisole with an adjustable strap and a soft cowl front.'],
  ['Pointelle Knit Top', 'women', 'tops', 5400, 0, ['Sand', 'Stone'], 'Layered Wool', 'merino', 'A fine pointelle knit with a boat neckline and a slightly cropped body.'],
  ['Trench Coat', 'women', 'jackets', 14500, 11600, ['Stone', 'Ink'], 'Autumn/Winter 026', 'cotton', 'A double-breasted trench in water-repellent cotton gabardine with storm flap and removable belt.'],
  ['Cropped Bomber', 'women', 'jackets', 12800, 0, ['Olive', 'Ink'], 'Autumn/Winter 026', 'wool', 'A cropped bomber in dense wool melton with a ribbed collar and hem.', 1],
  ['Pleated Wide Trouser', 'women', 'trousers', 7400, 0, ['Charcoal', 'Ecru'], 'Structured Tailoring', 'wool', 'A high-rise trouser with double pleats and a wide leg that falls to the instep.'],
  ['Straight Leg Jean', 'women', 'denim', 6900, 0, ['Rinse', 'Ink'], 'Core', 'denim', 'A high-rise straight jean in rigid organic denim that softens with wear.'],
  ['Leather Mule', 'women', 'footwear', 8400, 0, ['Ecru', 'Tan'], 'Structured Tailoring', 'leather', 'A square-toe leather mule with a low block heel and a cushioned insole.'],
  ['Silk Slip Belt', 'women', 'accessories', 2800, 0, ['Ink', 'Oxblood'], 'Quiet Evening', 'silk', 'A narrow belt in silk-faced grosgrain with a brushed brass buckle.'],
  ['Merino Crewneck', 'men', 'knitwear', 6200, 0, ['Sand', 'Charcoal', 'Ink'], 'Layered Wool', 'merino', 'A mid-weight crewneck in extra-fine merino with a close, clean rib and a regular fit.', 1],
  ['Wool Overcoat', 'men', 'jackets', 18900, 0, ['Charcoal', 'Ink'], 'Autumn/Winter 026', 'wool', 'A single-breasted overcoat in double-faced wool with a notch lapel and a knee-length body.', 1],
  ['Waxed Field Jacket', 'men', 'jackets', 15400, 0, ['Olive', 'Tan'], 'Autumn/Winter 026', 'cotton', 'A four-pocket field jacket in waxed cotton with a corduroy collar and a quilted lining.'],
  ['Tapered Wool Trouser', 'men', 'trousers', 7800, 0, ['Charcoal', 'Stone'], 'Structured Tailoring', 'wool', 'A mid-rise tapered trouser in tropical-weight wool with a single pleat and a clean break.', 1],
  ['Selvedge Straight Jean', 'men', 'denim', 8200, 0, ['Rinse', 'Ink'], 'Core', 'denim', 'A straight-leg jean in Japanese-woven selvedge denim with a button fly and a medium rise.'],
  ['Leather Chelsea Boot', 'men', 'footwear', 10900, 0, ['Ink', 'Tan'], 'Structured Tailoring', 'leather', 'A Goodyear-welted Chelsea boot with a sleek last, elastic gussets and a leather sole.'],
  ['Suede Loafer', 'men', 'footwear', 9600, 0, ['Tan', 'Charcoal'], 'Core', 'leather', 'A hand-stitched suede loafer with a soft, unlined interior and a flexible sole.'],
  ['Leather Belt', 'men', 'accessories', 3200, 0, ['Ink', 'Tan'], 'Structured Tailoring', 'leather', 'A 3cm belt in vegetable-tanned leather with a solid brass buckle.'],
  ['Oxford Shirt', 'men', 'shirts', 4900, 0, ['Ecru', 'Rinse'], 'Core', 'cotton', 'A button-down oxford in a washed, textured cotton with a soft collar roll.'],
  ['Linen Camp Shirt', 'men', 'shirts', 5200, 0, ['Sand', 'Olive'], 'Core', 'linen', 'A camp-collar shirt in garment-washed linen with a boxy, relaxed fit.'],
  ['Heavyweight Tee', 'men', 't-shirts', 2400, 0, ['Ecru', 'Ink', 'Stone'], 'Core', 'cotton', 'A 260gsm cotton tee with a ribbed crew neck and a slightly cropped, boxy body.', 1],
];

const rnd = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
const pw = (v) => v || crypto.randomBytes(9).toString('base64url') + '9a';

await connectDb();
await Promise.all([Category, Collection, Product, ProductVariant, Inventory, Coupon].map((m) => m.deleteMany({})));

const cats = Object.fromEntries((await Category.insertMany(CATEGORIES.map(([name, genders], i) => ({ name, slug: slugify(name), genders, sortOrder: i })))).map((c) => [c.slug, c]));
const cols = Object.fromEntries((await Collection.insertMany(COLLECTIONS.map(([name, description, season, featured], i) => ({ name, slug: slugify(name), description, season, featured, sortOrder: i })).concat([{ name: 'Core', slug: 'core', description: 'The permanent wardrobe: pieces we make every season.', season: 'Core', sortOrder: 9 }]))).map((c) => [c.name, c]));

let n = 0;
for (const [name, gender, catSlug, price, sale, colours, colName, fabric, blurb, isNew] of P) {
  const slug = `${slugify(name)}-${gender}`;
  const shape = SHAPES[catSlug];
  const images = []; let order = 0;
  for (const c of colours) for (const view of ['front', 'detail']) {
    const file = `${slug}-${slugify(c)}-${view}.svg`;
    writeSvg(file, shape, COLORS[c], view === 'detail');
    images.push({ url: `/media/seed/${file}`, alt: `${name} in ${c}, ${view} view`, color: c, order: order++ });
  }
  const product = await Product.create({
    name, slug, gender, category: cats[catSlug]._id, collections: [cols[colName]._id],
    description: blurb, price: price * 100, salePrice: sale ? sale * 100 : null, images,
    materials: FABRIC[fabric], care: CARE[careKey[fabric] ?? fabric],
    details: ['Designed in Chennai', 'Made in small runs', 'Fits true to size'],
    tags: [catSlug, gender, fabric, colName.toLowerCase()],
    status: 'published', featured: n % 5 === 0, publishedAt: new Date(Date.now() - n * 86400000),
    newArrivalUntil: isNew ? new Date(Date.now() + 60 * 86400000) : undefined,
    seo: { title: `${name} | Nessence`, description: blurb.slice(0, 155) },
  });
  const sizes = SIZES[catSlug] ?? APPAREL;
  for (const c of colours) for (const size of sizes) {
    const sku = `NS-${slugify(name).toUpperCase().replace(/-/g, '').slice(0, 8)}-${c.slice(0, 3).toUpperCase()}-${size.replace(/\s/g, '')}${gender[0].toUpperCase()}`;
    const v = await ProductVariant.create({ product: product._id, sku, color: { name: c, hex: COLORS[c] }, size });
    let stock = Math.floor(rnd(sku) * 22);
    if (name === 'Draped Column Gown' || ['XL'].includes(size) && rnd(sku + 'x') > 0.5) stock = 0;
    await Inventory.create({ variant: v._id, product: product._id, sku, stock, reserved: 0 });
  }
  await syncProductFacets(product._id);
  n++;
}

const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@nessence.local';
const custEmail = process.env.SEED_CUSTOMER_EMAIL || 'customer@nessence.local';
const adminPw = pw(process.env.SEED_ADMIN_PASSWORD); const custPw = pw(process.env.SEED_CUSTOMER_PASSWORD);
await Coupon.create([
  { code: 'NESSENCE10', description: '10% off your order', type: 'percent', value: 10, maxDiscount: 300000, minOrder: 200000 },
  { code: 'WELCOME500', description: '₹500 off orders over ₹4,000', type: 'fixed', value: 50000, minOrder: 400000, usageLimit: 500 },
]);
await Promise.all([User.deleteOne({ email: custEmail }), StaffUser.deleteOne({ email: adminEmail })]);
await StaffUser.create({ name: 'Store Admin', email: adminEmail, role: 'super_admin', passwordHash: await hashPassword(adminPw) });
await User.create({ name: 'Test Customer', email: custEmail, emailVerified: true, passwordHash: await hashPassword(custPw) });

await seedContent();
console.log(`\nSeeded ${n} products, ${Object.keys(cats).length} categories, ${Object.keys(cols).length} collections.`);
console.log('Dev credentials (shown once; set SEED_*_PASSWORD in .env to choose your own):');
console.log(`  staff     ${adminEmail}  /  ${adminPw}`);
console.log(`  customer  ${custEmail}  /  ${custPw}\n`);
await mongoose.disconnect();
