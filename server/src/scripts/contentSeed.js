import { SiteContent } from "../models/SiteContent.js";
import { Article } from "../models/Article.js";
import { COMMERCE } from "../config/commerce.js";

const inr = (p) => `₹${(p / 100).toLocaleString("en-IN")}`;

const PAGES = {
  about: [
    "About Nessence",
    `Nessence is a contemporary fashion label for men and women, designed in Chennai.

## Cloth before trend
Every piece starts with a fabric, not a mood board. We work with a small group of mills for wool, merino and long-staple cotton, then design around what the cloth already wants to do.

## Made in small runs
We make fewer pieces, more often. Small runs keep quality high and leftover stock low, and they let us fix a fit problem before it becomes a hundred returns.

## What we promise
Clear pricing, honest descriptions, and a returns process that doesn't make you argue your case. If something isn't right, tell us through the Contact page and we'll sort it out.`,
  ],
  shipping: [
    "Shipping",
    `We currently deliver within India.

## Delivery options
Standard delivery takes ${COMMERCE.delivery.standard.eta}. It is free on orders of ${inr(COMMERCE.freeShippingThreshold)} or more (after any discount) and ${inr(COMMERCE.shippingFee)} below that.
Express delivery takes ${COMMERCE.delivery.express.eta} and costs a flat ${inr(COMMERCE.delivery.express.fee)}.

## When your order ships
Orders are confirmed as soon as your payment is received. We aim to dispatch within 1–2 working days. You'll see each step — confirmed, packed, shipped, delivered — in your account, and we'll email you when it ships and when it arrives.

## Tracking
Signed-in customers can follow an order from My account. Anyone can use Track order with the order number and the email address used at checkout.

## Tax
Prices are shown before GST. GST at ${COMMERCE.taxRate * 100}% is added at checkout and itemised in your order summary.`,
  ],
  "returns-policy": [
    "Returns policy",
    `You can return unworn items within 14 days of delivery.

## What can be returned
Items must be unworn, unwashed and have their tags attached. Choose the items and the reason from your order page in My account.

## How it works
1. Request the return from your order page.
2. We review it within 2 working days and tell you if it is approved.
3. Send the items back using the details we give you.
4. When we receive them, we refund the item value to your original payment method.

## Costs and timing
We confirm the final refund amount when the items arrive. Refunds are sent to your original payment method and usually appear within 5–7 working days, depending on your bank.

## Need help?
If an item arrived damaged or isn't what you ordered, mention it in your request and we'll prioritise it. You can also reach us through the Contact page.`,
  ],
  "refund-policy": [
    "Refund policy",
    `Refunds always go back to the payment method used at checkout.

## Cancelled orders
You can cancel an order yourself until it is packed. The full amount, including shipping and tax, is refunded. After packing, contact us and we'll do our best to stop the parcel.

## Returned items
When a return is approved and the items reach us, we refund the item value. Shipping charges paid at checkout are not refunded on change-of-mind returns, but are refunded if the item was damaged or incorrect.

## Timing
We start the refund as soon as it is approved. Your bank or card issuer then takes about 5–7 working days to show it.

## Failed or duplicate payments
If you were charged but did not receive an order confirmation, the amount is returned automatically by your bank or payment provider. If it hasn't been after 7 working days, contact us with your payment reference.`,
  ],
  "size-guide": [
    "Size guide",
    `Measurements are body measurements in centimetres. If you are between sizes, we suggest sizing up for a relaxed fit or down for a closer fit.

## Women — dresses, tops and knitwear
Size | Bust | Waist | Hip
XS | 80 | 62 | 88
S | 84 | 66 | 92
M | 88 | 70 | 96
L | 94 | 76 | 102
XL | 100 | 82 | 108

## Men — shirts, tees, knitwear and jackets
Size | Chest | Waist | Shoulder
XS | 86 | 72 | 42
S | 92 | 78 | 44
M | 98 | 84 | 46
L | 104 | 90 | 48
XL | 110 | 96 | 50

## Trousers and denim
Size | Waist (cm)
30 | 76
32 | 81
34 | 86
36 | 91

## Footwear (UK sizes)
UK | Foot length (cm)
6 | 24.0
7 | 25.0
8 | 26.0
9 | 27.0
10 | 28.0

## How to measure
Measure over light clothing. Bust or chest at the fullest point, waist at the narrowest, hip at the widest.`,
  ],
  privacy: [
    "Privacy policy",
    `This policy explains what personal data Nessence collects, why, and your choices.

## What we collect
Account details (name, email, phone, optional date of birth), delivery addresses, order history, wishlist, and messages you send us. If you subscribe to our newsletter we store your email and when you confirmed.

## Payments
Payments are processed by our payment provider, Razorpay. Your card, UPI and bank details are entered in their secure window and never reach or get stored on our servers. We keep only a payment reference and status.

## How we use it
To process and deliver orders, handle returns and refunds, secure your account, answer your questions, and — only if you opted in — send you news about new arrivals.

## Who we share it with
Our payment provider, delivery partners (name, address and phone, to deliver your parcel), and our email delivery service. We do not sell your data.

## Cookies
We use only the cookies needed to keep you signed in and remember your bag. We don't use advertising or analytics cookies.

## Your choices
You can update your details, manage email preferences and delete your account from My account. Deleting your account removes your profile, addresses, wishlist and bag; we keep order records without your personal details for legal and accounting purposes.

## Contact
Questions about your data? Use the Contact page and choose "Other".`,
  ],
  terms: [
    "Terms & conditions",
    `By using Nessence you agree to these terms.

## Orders and prices
All prices are in Indian rupees. An order is accepted when you receive an order confirmation after payment. We may cancel an order if an item is unavailable or a pricing error occurred, in which case you are refunded in full.

## Payment
Payments are taken securely through our payment provider at checkout. You must be authorised to use the payment method you choose.

## Delivery, returns and refunds
These are described in our Shipping, Returns policy and Refund policy pages, which form part of these terms.

## Your account
Keep your password confidential. You are responsible for activity on your account. Tell us promptly if you suspect unauthorised use.

## Reviews
You may review products you have received. Reviews must be honest and respectful; we may remove content that is abusive, misleading or irrelevant.

## Product information
We describe and photograph products as accurately as we can; colours may vary slightly between screens.

## Changes
We may update these terms. The version on this page applies to orders placed after the update.`,
  ],
  "cookie-policy": [
    "Cookie policy",
    `Nessence uses a small number of cookies, all of them essential.

## Essential cookies
Session cookies keep you signed in and let us refresh your session securely. A bag cookie remembers your bag if you aren't signed in. These are strictly necessary for the shop to work, so they are set without a banner.

## What we don't use
We don't use advertising cookies, cross-site tracking, or third-party analytics cookies.

## Payment window
When you pay, the Razorpay window may set its own cookies to secure and complete your payment. These are governed by their policy.

## Control
You can clear cookies in your browser at any time; you will be signed out and your guest bag will be emptied.`,
  ],
  careers: [
    "Careers",
    `There are no open roles at Nessence right now.

We're a small team and we hire rarely. If you design, make or sell clothes, or build commerce software, we'd still like to hear from you — send a short note and a link to your work through the Contact page (choose "Other"). We read everything, and we'll keep your details in mind for when a role opens.`,
  ],
};

const FAQ = [
  [
    "How long does delivery take?",
    `Standard delivery takes ${COMMERCE.delivery.standard.eta}; express takes ${COMMERCE.delivery.express.eta}. Both are within India.`,
  ],
  [
    "Is shipping free?",
    `Standard shipping is free on orders of ${inr(COMMERCE.freeShippingThreshold)} or more after discounts, and ${inr(COMMERCE.shippingFee)} below that. Express is a flat ${inr(COMMERCE.delivery.express.fee)}.`,
  ],
  [
    "Can I change or cancel my order?",
    "You can cancel it yourself from your order page until it is packed. Once packed, contact us and we will try to stop it.",
  ],
  [
    "How do returns work?",
    "Request a return from your order page within 14 days of delivery. We review it within 2 working days, and refund you after we receive the items.",
  ],
  [
    "How do I find my size?",
    "See the Size guide for body measurements by size. If you are between sizes, size up for a relaxed fit.",
  ],
  [
    "How do I track my order?",
    "Sign in and open the order in My account, or use Track order with your order number and email.",
  ],
  [
    "Which payment methods do you accept?",
    "Cards, UPI, netbanking and wallets, through Razorpay. We never see or store your payment details.",
  ],
  [
    "I was charged but have no order confirmation.",
    "This usually resolves within minutes. If not, your bank reverses the charge automatically; contact us with your payment reference if it has not after 7 working days.",
  ],
  [
    "How do I use a discount code?",
    "Enter it in your bag. We check it against the current rules and show the saving before you pay.",
  ],
];

const ARTICLES = [
  {
    title: "On wool, and why weight matters",
    author: "The Nessence studio",
    tags: ["materials", "knitwear"],
    excerpt:
      "Two coats in the same wool can wear nothing alike. The difference is weight, weave and what you want the cloth to do.",
    content: `People ask what wool a coat is made from. A better question is how heavy it is.

## Weight changes everything
A light worsted drapes and moves; a dense melton holds a shape. Both are wool, and they suit entirely different days. We choose weight first, then decide what the garment can ask of it.

## Why we layer weights
Our Layered Wool group is cut to be worn over and under itself: a fine merino next to the skin, a mid-weight knit over it, and a coat that can carry both without bulk. Each piece is slightly different in weight so they don't fight each other.

## Caring for it
Wool forgives more than people expect. Air it, brush it, rest it between wears, and dry clean only when it truly needs it.`,
  },
  {
    title: "The bias cut, explained",
    author: "The Nessence studio",
    tags: ["craft", "dresses"],
    excerpt:
      "Cut across the grain, fabric stops behaving like a flat sheet and starts to move. That is the whole trick behind a slip dress.",
    content: `Fabric is woven on a grid. Cut along that grid and it hangs straight; cut at forty-five degrees — on the bias — and it stretches slightly and falls in soft curves.

## Why it flatters without clinging
Because the cloth gives a little, it follows the body without needing darts or tight seams. The line comes from the cut, not from structure.

## What it asks of the maker
Bias-cut pieces need to hang before they're hemmed, because they continue to drop. We let each one rest overnight on a form, then finish the hem by hand.

## Wearing it
Choose a size you can move in. Slip dresses reward a little ease, and look best when the straps are adjusted to sit where you'd like the neckline to fall.`,
  },
  {
    title: "A short guide to building a wardrobe that lasts",
    author: "The Nessence studio",
    tags: ["style", "guide"],
    excerpt:
      "Fewer, better pieces, chosen in a few neutral tones, will outlast any season. Here is how we think about it.",
    content: `A lasting wardrobe isn't a large one. It's a set of pieces that work together and that you actually reach for.

## Start with the tones
Pick three or four colours that look good on you and sit well together. Ink, stone, ecru and one warm accent go with almost everything we make.

## Invest where it shows
A coat, a pair of trousers that fit properly, and a good pair of boots do most of the work. Spend there first.

## Buy for the life of the garment
Check the fabric, the seams and how it will be cared for. A piece you can mend and keep wearing is cheaper than one you replace every season.

## Edit as you go
If you haven't worn something in a year, it isn't earning its place. Pass it on and let the rest breathe.`,
  },
];

export async function seedContent() {
  for (const [key, [title, body]] of Object.entries(PAGES))
    await SiteContent.updateOne(
      { key },
      { $setOnInsert: { key, title, body } },
      { upsert: true },
    );
  await SiteContent.updateOne(
    { key: "faq" },
    {
      $setOnInsert: {
        key: "faq",
        title: "Frequently asked questions",
        body: "",
        data: { items: FAQ.map(([q, a]) => ({ q, a })) },
      },
    },
    { upsert: true },
  );
  const slugify = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  let n = 0;
  for (const a of ARTICLES) {
    await Article.updateOne(
      { slug: slugify(a.title) },
      {
        $setOnInsert: {
          ...a,
          slug: slugify(a.title),
          status: "published",
          publishedAt: new Date(Date.now() - (n++ + 1) * 7 * 86400000),
          seo: {
            title: `${a.title} | Nessence Journal`,
            description: a.excerpt.slice(0, 155),
          },
        },
      },
      { upsert: true },
    );
  }
  return { pages: Object.keys(PAGES).length + 1, articles: ARTICLES.length };
}
