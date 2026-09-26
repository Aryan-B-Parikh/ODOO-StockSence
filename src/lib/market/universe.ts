/**
 * StockSense — Market Universe
 * Static seed definitions for the simulated market.
 * NOTE: All data is SIMULATED for demo purposes. Base prices/fundamentals are
 * illustrative approximations, not real market data.
 */

export interface StockDef {
  symbol: string
  name: string
  sector: string
  exchange: 'NASDAQ' | 'NYSE'
  basePrice: number
  marketCapB: number // billions at base price
  peRatio: number
  eps: number
  dividendYield: number // percent
  beta: number
  dailyVol: number // daily volatility (fraction)
  employees: number
  ceo: string
  hq: string
  website: string
  founded: string
  description: string
}

export const SECTORS = [
  'Technology',
  'Financials',
  'Healthcare',
  'Consumer',
  'Communication',
  'Energy',
  'Industrials',
] as const

export type Sector = (typeof SECTORS)[number]

export const STOCKS: StockDef[] = [
  // ---------- Technology ----------
  {
    symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', exchange: 'NASDAQ',
    basePrice: 212.4, marketCapB: 3250, peRatio: 33.2, eps: 6.4, dividendYield: 0.48, beta: 1.22,
    dailyVol: 0.014, employees: 161000, ceo: 'Tim Cook', hq: 'Cupertino, California',
    website: 'https://www.apple.com', founded: '1976',
    description: 'Designs and manufactures smartphones, personal computers, tablets, wearables and accessories, and sells a variety of related services including the App Store, iCloud and Apple Pay.',
  },
  {
    symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', exchange: 'NASDAQ',
    basePrice: 428.9, marketCapB: 3180, peRatio: 35.8, eps: 11.8, dividendYield: 0.72, beta: 0.92,
    dailyVol: 0.013, employees: 228000, ceo: 'Satya Nadella', hq: 'Redmond, Washington',
    website: 'https://www.microsoft.com', founded: '1975',
    description: 'Develops and licenses software including Windows, Office 365, and Azure cloud services, and sells devices, gaming consoles, and advertising.',
  },
  {
    symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', exchange: 'NASDAQ',
    basePrice: 121.6, marketCapB: 2990, peRatio: 64.4, eps: 1.89, dividendYield: 0.03, beta: 1.68,
    dailyVol: 0.028, employees: 29600, ceo: 'Jensen Huang', hq: 'Santa Clara, California',
    website: 'https://www.nvidia.com', founded: '1993',
    description: 'Designs graphics processing units for gaming and professional markets, and systems-on-a-chip for mobile computing and automotive, and is a leader in AI data-center accelerators.',
  },
  {
    symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication', exchange: 'NASDAQ',
    basePrice: 176.3, marketCapB: 2170, peRatio: 23.9, eps: 7.38, dividendYield: 0.44, beta: 1.04,
    dailyVol: 0.016, employees: 182502, ceo: 'Sundar Pichai', hq: 'Mountain View, California',
    website: 'https://abc.xyz', founded: '1998',
    description: 'Holding company of Google, providing web search, advertising, YouTube, Android, Chrome, Google Cloud and hardware products globally.',
  },
  {
    symbol: 'AMZN', name: 'Amazon.com, Inc.', sector: 'Consumer', exchange: 'NASDAQ',
    basePrice: 198.2, marketCapB: 2080, peRatio: 41.6, eps: 4.76, dividendYield: 0, beta: 1.15,
    dailyVol: 0.018, employees: 1525000, ceo: 'Andy Jassy', hq: 'Seattle, Washington',
    website: 'https://www.amazon.com', founded: '1994',
    description: 'Engages in retail sale of consumer products and subscriptions, advertising, and cloud computing through Amazon Web Services worldwide.',
  },
  {
    symbol: 'META', name: 'Meta Platforms, Inc.', sector: 'Communication', exchange: 'NASDAQ',
    basePrice: 563.1, marketCapB: 1420, peRatio: 27.1, eps: 20.77, dividendYield: 0.39, beta: 1.21,
    dailyVol: 0.019, employees: 69767, ceo: 'Mark Zuckerberg', hq: 'Menlo Park, California',
    website: 'https://www.meta.com', founded: '2004',
    description: 'Builds products enabling people to connect and share through mobile devices, personal computers and wearables, including Facebook, Instagram and WhatsApp, plus Reality Labs.',
  },
  {
    symbol: 'TSLA', name: 'Tesla, Inc.', sector: 'Consumer', exchange: 'NASDAQ',
    basePrice: 244.5, marketCapB: 780, peRatio: 58.9, eps: 4.15, dividendYield: 0, beta: 2.04,
    dailyVol: 0.032, employees: 140477, ceo: 'Elon Musk', hq: 'Austin, Texas',
    website: 'https://www.tesla.com', founded: '2003',
    description: 'Designs, develops, manufactures and sells fully electric vehicles, energy generation and storage systems, and offers full self-driving software.',
  },
  {
    symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', sector: 'Technology', exchange: 'NASDAQ',
    basePrice: 158.7, marketCapB: 256, peRatio: 46.3, eps: 3.43, dividendYield: 0, beta: 1.72,
    dailyVol: 0.026, employees: 26000, ceo: 'Lisa Su', hq: 'Santa Clara, California',
    website: 'https://www.amd.com', founded: '1969',
    description: 'Operates as a semiconductor company delivering high-performance CPU, GPU and adaptive SoC products for data center, client, gaming and embedded markets.',
  },
  {
    symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'Technology', exchange: 'NASDAQ',
    basePrice: 168.4, marketCapB: 780, peRatio: 72.4, eps: 2.33, dividendYield: 1.28, beta: 1.19,
    dailyVol: 0.02, employees: 20000, ceo: 'Hock Tan', hq: 'Palo Alto, California',
    website: 'https://www.broadcom.com', founded: '1961',
    description: 'Designs, develops and supplies semiconductor and infrastructure software solutions, including custom AI accelerators and networking silicon.',
  },
  {
    symbol: 'CRM', name: 'Salesforce, Inc.', sector: 'Technology', exchange: 'NYSE',
    basePrice: 285.6, marketCapB: 274, peRatio: 46.8, eps: 6.11, dividendYield: 0.58, beta: 1.29,
    dailyVol: 0.019, employees: 72582, ceo: 'Marc Benioff', hq: 'San Francisco, California',
    website: 'https://www.salesforce.com', founded: '1999',
    description: 'Provides customer relationship management technology that brings companies and customers together via integrated applications for sales, service, marketing and analytics.',
  },
  {
    symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Technology', exchange: 'NASDAQ',
    basePrice: 486.2, marketCapB: 214, peRatio: 33.4, eps: 14.56, dividendYield: 0, beta: 1.32,
    dailyVol: 0.02, employees: 29945, ceo: 'Shantanu Narayen', hq: 'San Jose, California',
    website: 'https://www.adobe.com', founded: '1982',
    description: 'Operates as a diversified software company delivering creative, document and experience cloud solutions including Photoshop, Acrobat and Experience Platform.',
  },
  {
    symbol: 'NFLX', name: 'Netflix, Inc.', sector: 'Communication', exchange: 'NASDAQ',
    basePrice: 682.4, marketCapB: 292, peRatio: 44.7, eps: 15.26, dividendYield: 0, beta: 1.38,
    dailyVol: 0.022, employees: 13000, ceo: 'Ted Sarandos', hq: 'Los Gatos, California',
    website: 'https://www.netflix.com', founded: '1997',
    description: 'Provides entertainment services offering TV series, documentaries, films and mobile games across genres and languages for streaming members.',
  },
  {
    symbol: 'ORCL', name: 'Oracle Corporation', sector: 'Technology', exchange: 'NYSE',
    basePrice: 172.8, marketCapB: 478, peRatio: 40.2, eps: 4.3, dividendYield: 0.94, beta: 1.02,
    dailyVol: 0.016, employees: 159000, ceo: 'Safra Catz', hq: 'Austin, Texas',
    website: 'https://www.oracle.com', founded: '1977',
    description: 'Offers cloud applications and cloud infrastructure platforms, database software, and middleware to enterprises worldwide.',
  },
  {
    symbol: 'IBM', name: 'International Business Machines', sector: 'Technology', exchange: 'NYSE',
    basePrice: 221.5, marketCapB: 205, peRatio: 31.2, eps: 7.1, dividendYield: 2.98, beta: 0.72,
    dailyVol: 0.012, employees: 282200, ceo: 'Arvind Krishna', hq: 'Armonk, New York',
    website: 'https://www.ibm.com', founded: '1911',
    description: 'Provides hybrid cloud and AI solutions, consulting, and infrastructure software and hardware including Red Hat OpenShift and watsonx.',
  },
  {
    symbol: 'INTC', name: 'Intel Corporation', sector: 'Technology', exchange: 'NASDAQ',
    basePrice: 23.8, marketCapB: 102, peRatio: 0, eps: -0.32, dividendYield: 0, beta: 1.06,
    dailyVol: 0.024, employees: 116500, ceo: 'Pat Gelsinger', hq: 'Santa Clara, California',
    website: 'https://www.intel.com', founded: '1968',
    description: 'Designs and manufactures microprocessors and platform solutions for cloud, smart edge and connected devices, including foundry services.',
  },
  {
    symbol: 'QCOM', name: 'QUALCOMM Incorporated', sector: 'Technology', exchange: 'NASDAQ',
    basePrice: 162.3, marketCapB: 181, peRatio: 21.4, eps: 7.58, dividendYield: 2.11, beta: 1.28,
    dailyVol: 0.018, employees: 50000, ceo: 'Cristiano Amon', hq: 'San Diego, California',
    website: 'https://www.qualcomm.com', founded: '1985',
    description: 'Develops and commercializes foundational technologies for wireless connectivity, mobile SoCs, automotive and IoT platforms.',
  },
  // ---------- Financials ----------
  {
    symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financials', exchange: 'NYSE',
    basePrice: 224.7, marketCapB: 645, peRatio: 12.1, eps: 18.56, dividendYield: 2.05, beta: 1.09,
    dailyVol: 0.014, employees: 316231, ceo: 'Jamie Dimon', hq: 'New York, New York',
    website: 'https://www.jpmorganchase.com', founded: '1799',
    description: 'Operates as a financial services company providing consumer and commercial banking, investment banking, markets, asset management and private banking.',
  },
  {
    symbol: 'V', name: 'Visa Inc.', sector: 'Financials', exchange: 'NYSE',
    basePrice: 282.9, marketCapB: 578, peRatio: 30.6, eps: 9.25, dividendYield: 0.73, beta: 0.95,
    dailyVol: 0.012, employees: 31100, ceo: 'Ryan McInerney', hq: 'San Francisco, California',
    website: 'https://www.visa.com', founded: '1958',
    description: 'Operates VisaNet, a global payments network enabling authorization, clearing and settlement of payment transactions worldwide.',
  },
  {
    symbol: 'MA', name: 'Mastercard Incorporated', sector: 'Financials', exchange: 'NYSE',
    basePrice: 492.6, marketCapB: 455, peRatio: 38.9, eps: 12.66, dividendYield: 0.56, beta: 1.08,
    dailyVol: 0.013, employees: 33400, ceo: 'Michael Miebach', hq: 'Purchase, New York',
    website: 'https://www.mastercard.com', founded: '1966',
    description: 'Provides payment processing and related services connecting consumers, financial institutions, merchants and governments across more than 210 countries.',
  },
  {
    symbol: 'BAC', name: 'Bank of America Corp.', sector: 'Financials', exchange: 'NYSE',
    basePrice: 39.8, marketCapB: 312, peRatio: 12.6, eps: 3.16, dividendYield: 2.32, beta: 1.31,
    dailyVol: 0.016, employees: 213270, ceo: 'Brian Moynihan', hq: 'Charlotte, North Carolina',
    website: 'https://www.bankofamerica.com', founded: '1904',
    description: 'Provides banking and financial products and services to individuals, SMEs and large corporations including deposits, lending, wealth management and trading.',
  },
  {
    symbol: 'WFC', name: 'Wells Fargo & Company', sector: 'Financials', exchange: 'NYSE',
    basePrice: 66.2, marketCapB: 219, peRatio: 13.4, eps: 4.94, dividendYield: 2.41, beta: 1.14,
    dailyVol: 0.015, employees: 217500, ceo: 'Charlie Scharf', hq: 'San Francisco, California',
    website: 'https://www.wellsfargo.com', founded: '1852',
    description: 'Provides diversified banking, investment, mortgage and consumer finance products through four segments including consumer banking and lending.',
  },
  {
    symbol: 'GS', name: 'The Goldman Sachs Group', sector: 'Financials', exchange: 'NYSE',
    basePrice: 512.4, marketCapB: 168, peRatio: 15.8, eps: 32.43, dividendYield: 2.02, beta: 1.34,
    dailyVol: 0.016, employees: 46500, ceo: 'David Solomon', hq: 'New York, New York',
    website: 'https://www.goldmansachs.com', founded: '1869',
    description: 'Offers investment banking, securities trading, asset management and wealth management services to corporations, institutions and high-net-worth individuals.',
  },
  {
    symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', sector: 'Financials', exchange: 'NYSE',
    basePrice: 462.8, marketCapB: 998, peRatio: 14.6, eps: 31.7, dividendYield: 0, beta: 0.87,
    dailyVol: 0.01, employees: 396100, ceo: 'Warren Buffett', hq: 'Omaha, Nebraska',
    website: 'https://www.berkshirehathaway.com', founded: '1839',
    description: 'Holding company owning subsidiaries engaged in insurance, freight rail transportation, utilities, manufacturing, services and retailing, plus a large equity portfolio.',
  },
  // ---------- Healthcare ----------
  {
    symbol: 'LLY', name: 'Eli Lilly and Company', sector: 'Healthcare', exchange: 'NYSE',
    basePrice: 872.5, marketCapB: 830, peRatio: 128.4, eps: 6.8, dividendYield: 0.6, beta: 0.42,
    dailyVol: 0.018, employees: 43000, ceo: 'David Ricks', hq: 'Indianapolis, Indiana',
    website: 'https://www.lilly.com', founded: '1876',
    description: 'Discovers, develops and markets human pharmaceutical products including diabetes and obesity therapies, oncology and immunology drugs.',
  },
  {
    symbol: 'UNH', name: 'UnitedHealth Group Inc.', sector: 'Healthcare', exchange: 'NYSE',
    basePrice: 568.3, marketCapB: 524, peRatio: 34.2, eps: 16.62, dividendYield: 1.41, beta: 0.56,
    dailyVol: 0.013, employees: 440000, ceo: 'Andrew Witty', hq: 'Minnetonka, Minnesota',
    website: 'https://www.unitedhealthgroup.com', founded: '1977',
    description: 'Operates diversified health care benefits through UnitedHealthcare and health services through Optum including pharmacy care and data analytics.',
  },
  {
    symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', exchange: 'NYSE',
    basePrice: 156.8, marketCapB: 377, peRatio: 22.6, eps: 6.94, dividendYield: 3.12, beta: 0.52,
    dailyVol: 0.009, employees: 131900, ceo: 'Joaquin Duato', hq: 'New Brunswick, New Jersey',
    website: 'https://www.jnj.com', founded: '1886',
    description: 'Researches, develops and manufactures pharmaceutical products and medical devices across immunology, oncology, neurology, cardiovascular and surgery.',
  },
  {
    symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare', exchange: 'NYSE',
    basePrice: 25.9, marketCapB: 147, peRatio: 11.8, eps: 2.2, dividendYield: 6.42, beta: 0.61,
    dailyVol: 0.013, employees: 88000, ceo: 'Albert Bourla', hq: 'New York, New York',
    website: 'https://www.pfizer.com', founded: '1849',
    description: 'Discovers, develops and sells biopharmaceutical products including vaccines, oncology therapies, internal medicine and rare disease treatments.',
  },
  {
    symbol: 'MRK', name: 'Merck & Co., Inc.', sector: 'Healthcare', exchange: 'NYSE',
    basePrice: 112.4, marketCapB: 285, peRatio: 22.4, eps: 5.02, dividendYield: 2.71, beta: 0.39,
    dailyVol: 0.011, employees: 75000, ceo: 'Robert Davis', hq: 'Rahway, New Jersey',
    website: 'https://www.merck.com', founded: '1891',
    description: 'Offers prescription medicines, vaccines and animal health products, led by oncology blockbuster Keytruda and cardiometabolic therapies.',
  },
  {
    symbol: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare', exchange: 'NYSE',
    basePrice: 178.2, marketCapB: 318, peRatio: 48.6, eps: 3.67, dividendYield: 3.28, beta: 0.58,
    dailyVol: 0.011, employees: 55000, ceo: 'Robert Michael', hq: 'North Chicago, Illinois',
    website: 'https://www.abbvie.com', founded: '2013',
    description: 'Researches and markets biopharmaceuticals including immunology franchise Humira and Skyrizi, oncology, neuroscience and aesthetics portfolios.',
  },
  {
    symbol: 'TMO', name: 'Thermo Fisher Scientific', sector: 'Healthcare', exchange: 'NYSE',
    basePrice: 528.7, marketCapB: 203, peRatio: 35.1, eps: 15.06, dividendYield: 0.29, beta: 0.94,
    dailyVol: 0.012, employees: 122000, ceo: 'Marc Casper', hq: 'Waltham, Massachusetts',
    website: 'https://www.thermofisher.com', founded: '1956',
    description: 'Provides life sciences solutions, analytical instruments, specialty diagnostics and laboratory products and services to research and industry.',
  },
  // ---------- Consumer ----------
  {
    symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer', exchange: 'NYSE',
    basePrice: 92.6, marketCapB: 744, peRatio: 36.8, eps: 2.52, dividendYield: 0.98, beta: 0.53,
    dailyVol: 0.009, employees: 2100000, ceo: 'Doug McMillon', hq: 'Bentonville, Arkansas',
    website: 'https://www.walmart.com', founded: '1962',
    description: 'Operates retail and wholesale stores and e-commerce in the US and internationally, plus membership clubs and a fast-growing advertising business.',
  },
  {
    symbol: 'COST', name: 'Costco Wholesale Corp.', sector: 'Consumer', exchange: 'NASDAQ',
    basePrice: 896.2, marketCapB: 398, peRatio: 52.4, eps: 17.1, dividendYield: 0.5, beta: 0.79,
    dailyVol: 0.011, employees: 333000, ceo: 'Ron Vachris', hq: 'Issaquah, Washington',
    website: 'https://www.costco.com', founded: '1983',
    description: 'Operates membership warehouses offering branded and private-label products across merchandise categories at low prices with high volume turnover.',
  },
  {
    symbol: 'KO', name: 'The Coca-Cola Company', sector: 'Consumer', exchange: 'NYSE',
    basePrice: 62.4, marketCapB: 269, peRatio: 26.2, eps: 2.38, dividendYield: 3.05, beta: 0.62,
    dailyVol: 0.007, employees: 79100, ceo: 'James Quincey', hq: 'Atlanta, Georgia',
    website: 'https://www.coca-colacompany.com', founded: '1892',
    description: 'Manufactures and markets nonalcoholic beverages including sparkling soft drinks, water, sports drinks, coffee and juice brands worldwide.',
  },
  {
    symbol: 'PEP', name: 'PepsiCo, Inc.', sector: 'Consumer', exchange: 'NASDAQ',
    basePrice: 168.9, marketCapB: 232, peRatio: 22.8, eps: 7.41, dividendYield: 3.12, beta: 0.53,
    dailyVol: 0.007, employees: 319000, ceo: 'Ramon Laguarta', hq: 'Purchase, New York',
    website: 'https://www.pepsico.com', founded: '1898',
    description: 'Operates across beverages and convenient foods including Lay\'s, Doritos, Quaker, Pepsi and Gatorade, with a growing better-for-you portfolio.',
  },
  {
    symbol: 'PG', name: 'The Procter & Gamble Co.', sector: 'Consumer', exchange: 'NYSE',
    basePrice: 172.3, marketCapB: 405, peRatio: 27.4, eps: 6.28, dividendYield: 2.38, beta: 0.41,
    dailyVol: 0.007, employees: 108000, ceo: 'Jon Moeller', hq: 'Cincinnati, Ohio',
    website: 'https://www.pg.com', founded: '1837',
    description: 'Provides branded consumer packaged goods across fabric and home care, baby and family care, and beauty, grooming and health care segments.',
  },
  {
    symbol: 'MCD', name: 'McDonald\'s Corporation', sector: 'Consumer', exchange: 'NYSE',
    basePrice: 295.4, marketCapB: 211, peRatio: 25.6, eps: 11.54, dividendYield: 2.26, beta: 0.71,
    dailyVol: 0.008, employees: 150000, ceo: 'Chris Kempczinski', hq: 'Chicago, Illinois',
    website: 'https://www.mcdonalds.com', founded: '1955',
    description: 'Franchises and operates McDonald\'s restaurants serving a menu of burgers, chicken, breakfast items, beverages and coffee in over 100 countries.',
  },
  {
    symbol: 'NKE', name: 'NIKE, Inc.', sector: 'Consumer', exchange: 'NYSE',
    basePrice: 78.2, marketCapB: 117, peRatio: 21.9, eps: 3.57, dividendYield: 1.94, beta: 1.08,
    dailyVol: 0.014, employees: 79400, ceo: 'Elliott Hill', hq: 'Beaverton, Oregon',
    website: 'https://www.nike.com', founded: '1964',
    description: 'Designs, markets and distributes athletic footwear, apparel, equipment and accessories through its own stores and digital platforms worldwide.',
  },
  {
    symbol: 'SBUX', name: 'Starbucks Corporation', sector: 'Consumer', exchange: 'NASDAQ',
    basePrice: 96.8, marketCapB: 110, peRatio: 28.9, eps: 3.35, dividendYield: 2.41, beta: 0.94,
    dailyVol: 0.012, employees: 381000, ceo: 'Brian Niccol', hq: 'Seattle, Washington',
    website: 'https://www.starbucks.com', founded: '1971',
    description: 'Roasts, markets and retails specialty coffee worldwide through company-operated and licensed stores plus packaged goods and digital rewards.',
  },
  {
    symbol: 'HD', name: 'The Home Depot, Inc.', sector: 'Consumer', exchange: 'NYSE',
    basePrice: 412.6, marketCapB: 409, peRatio: 27.8, eps: 14.84, dividendYield: 2.19, beta: 1.03,
    dailyVol: 0.01, employees: 465000, ceo: 'Ted Decker', hq: 'Atlanta, Georgia',
    website: 'https://www.homedepot.com', founded: '1978',
    description: 'Sells building materials, home improvement products, lawn and garden items and services through big-box stores and e-commerce for DIY and Pro customers.',
  },
  {
    symbol: 'DIS', name: 'The Walt Disney Company', sector: 'Communication', exchange: 'NYSE',
    basePrice: 112.7, marketCapB: 205, peRatio: 41.2, eps: 2.73, dividendYield: 0.82, beta: 1.4,
    dailyVol: 0.015, employees: 225000, ceo: 'Bob Iger', hq: 'Burbank, California',
    website: 'https://www.thewaltdisneycompany.com', founded: '1923',
    description: 'Entertainment company spanning studios, streaming (Disney+, Hulu), linear networks and experiences including parks, resorts and cruise lines.',
  },
  // ---------- Energy ----------
  {
    symbol: 'XOM', name: 'Exxon Mobil Corporation', sector: 'Energy', exchange: 'NYSE',
    basePrice: 117.8, marketCapB: 521, peRatio: 14.2, eps: 8.29, dividendYield: 3.24, beta: 0.88,
    dailyVol: 0.012, employees: 61500, ceo: 'Darren Woods', hq: 'Spring, Texas',
    website: 'https://www.exxonmobil.com', founded: '1870',
    description: 'Explores and produces crude oil and natural gas, manufactures petroleum products, and operates low-carbon solutions across petrochemical value chains.',
  },
  {
    symbol: 'CVX', name: 'Chevron Corporation', sector: 'Energy', exchange: 'NYSE',
    basePrice: 158.4, marketCapB: 291, peRatio: 15.1, eps: 10.49, dividendYield: 4.02, beta: 0.9,
    dailyVol: 0.012, employees: 45600, ceo: 'Mike Wirth', hq: 'Houston, Texas',
    website: 'https://www.chevron.com', founded: '1879',
    description: 'Integrated energy company with upstream and downstream operations, transporting crude and natural gas via pipeline and shipping worldwide.',
  },
  // ---------- Industrials ----------
  {
    symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials', exchange: 'NYSE',
    basePrice: 402.3, marketCapB: 196, peRatio: 17.8, eps: 22.6, dividendYield: 1.42, beta: 1.11,
    dailyVol: 0.013, employees: 113200, ceo: 'Jim Umpleby', hq: 'Irving, Texas',
    website: 'https://www.caterpillar.com', founded: '1925',
    description: 'Manufactures construction and mining equipment, off-highway diesel engines and turbines, and provides financing and digital services globally.',
  },
  {
    symbol: 'BA', name: 'The Boeing Company', sector: 'Industrials', exchange: 'NYSE',
    basePrice: 152.6, marketCapB: 117, peRatio: 0, eps: -8.24, dividendYield: 0, beta: 1.55,
    dailyVol: 0.021, employees: 171000, ceo: 'Kelly Ortberg', hq: 'Arlington, Virginia',
    website: 'https://www.boeing.com', founded: '1916',
    description: 'Designs, manufactures and services commercial jetliners, defense aircraft, satellites and provides aftermarket support worldwide.',
  },
  {
    symbol: 'GE', name: 'GE Aerospace', sector: 'Industrials', exchange: 'NYSE',
    basePrice: 182.4, marketCapB: 198, peRatio: 36.2, eps: 5.04, dividendYield: 0.66, beta: 1.24,
    dailyVol: 0.014, employees: 52000, ceo: 'Larry Culp', hq: 'Cincinnati, Ohio',
    website: 'https://www.geaerospace.com', founded: '1892',
    description: 'Designs and produces commercial and defense jet engines, integrated engine components and aftermarket services for the aviation industry.',
  },
  {
    symbol: 'UPS', name: 'United Parcel Service, Inc.', sector: 'Industrials', exchange: 'NYSE',
    basePrice: 132.5, marketCapB: 113, peRatio: 22.4, eps: 5.92, dividendYield: 4.94, beta: 1.04,
    dailyVol: 0.011, employees: 500000, ceo: 'Carol Tomé', hq: 'Atlanta, Georgia',
    website: 'https://www.ups.com', founded: '1907',
    description: 'Provides package delivery and supply chain services including express, ground, freight forwarding and logistics in more than 220 countries.',
  },
]

export const STOCK_BY_SYMBOL: Record<string, StockDef> = Object.fromEntries(
  STOCKS.map((s) => [s.symbol, s]),
)

/** Index definitions (computed from constituent weighted performance). */
export interface IndexDef {
  key: string
  name: string
  members: string[]
  base: number
  weighting: 'cap' | 'price'
}

export const INDICES: IndexDef[] = [
  {
    key: 'SPX',
    name: 'S&P 500',
    members: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'AVGO', 'TSLA', 'BRK.B', 'LLY', 'JPM', 'V', 'WMT', 'UNH', 'XOM', 'MA', 'ORCL', 'COST', 'JNJ', 'HD'],
    base: 5470.4,
    weighting: 'cap',
  },
  {
    key: 'NDX',
    name: 'Nasdaq Composite',
    members: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'AVGO', 'AMD', 'TSLA', 'NFLX', 'ADBE', 'CRM', 'QCOM', 'INTC', 'COST', 'PEP', 'SBUX'],
    base: 17862.9,
    weighting: 'cap',
  },
  {
    key: 'DJI',
    name: 'Dow Jones',
    members: ['AAPL', 'MSFT', 'GS', 'JPM', 'CAT', 'WMT', 'MCD', 'HD', 'NKE', 'DIS', 'IBM', 'BA'],
    base: 39150.2,
    weighting: 'price',
  },
]
