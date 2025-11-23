import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Array of major US cities for rotation
const MAJOR_CITIES = [
  'Los Angeles, CA',
  'New York, NY',
  'Chicago, IL',
  'Houston, TX',
  'Phoenix, AZ',
  'Philadelphia, PA',
  'San Antonio, TX',
  'San Diego, CA',
  'Dallas, TX',
  'San Jose, CA',
  'Austin, TX',
  'Jacksonville, FL',
  'Fort Worth, TX',
  'Columbus, OH',
  'Charlotte, NC',
  'San Francisco, CA',
  'Indianapolis, IN',
  'Seattle, WA',
  'Denver, CO',
  'Boston, MA',
  'Miami, FL',
  'Atlanta, GA',
  'Detroit, MI',
  'Portland, OR',
  'Las Vegas, NV'
];

/**
 * Generates a random multiplier between 85 and 115 (representing 85% to 115% of actual price)
 * Uses Math.js API for random number generation
 * @returns {Promise<number>} Random multiplier (85 to 115)
 */
async function getRandomPriceMultiplier() {
  try {
    // Get random number between 85 and 115 (for ±15% adjustment)
    const response = await fetch('https://api.mathjs.org/v4/?expr=randomInt(85,116)');

    if (!response.ok) {
      throw new Error('Math.js API failed');
    }

    const randomValue = await response.text();
    const multiplier = parseInt(randomValue.trim());

    return multiplier;
  } catch (error) {
    console.error('Error getting random multiplier from Math.js API:', error);
    // Fallback to Math.random if API fails
    return Math.floor(Math.random() * 31) + 85; // 85 to 115
  }
}

/**
 * Fetches a random real estate listing from Zillow API
 * Randomly selects a city from MAJOR_CITIES array
 * @returns {Promise<Object>} Listing data from Zillow
 */
async function fetchRandomListing() {
  // Randomly select a city
  const randomCity = MAJOR_CITIES[Math.floor(Math.random() * MAJOR_CITIES.length)];

  console.log(`Fetching listing for: ${randomCity}`);

  const url = new URL('https://zillow-com1.p.rapidapi.com/propertyExtendedSearch');
  url.searchParams.append('location', randomCity);
  url.searchParams.append('status_type', 'ForSale');
  url.searchParams.append('home_type', 'Houses');

  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-host': process.env.RAPIDAPI_HOST || 'zillow-com1.p.rapidapi.com',
      'x-rapidapi-key': process.env.RAPIDAPI_KEY
    }
  };

  try {
    const response = await fetch(url.toString(), options);

    if (!response.ok) {
      throw new Error(`RapidAPI responded with status: ${response.status}`);
    }

    const data = await response.json();

    // Extract a random listing from the results
    if (data.props && data.props.length > 0) {
      const randomListing = data.props[Math.floor(Math.random() * data.props.length)];

      // Get actual price
      const actualPrice = randomListing.price || 0;

      // Generate displayed price with ±15% adjustment (multiplier is 85-115)
      // Ensure displayed price is never exactly the same as actual price
      let multiplier = await getRandomPriceMultiplier();
      while (multiplier === 100) {
        multiplier = await getRandomPriceMultiplier();
      }
      const displayedPrice = Math.round(actualPrice * (multiplier / 100));
      const adjustmentPercent = multiplier - 100;

      console.log(`Actual Price: $${actualPrice.toLocaleString()}`);
      console.log(`Multiplier: ${multiplier}% (${adjustmentPercent > 0 ? '+' : ''}${adjustmentPercent}%)`);
      console.log(`Displayed Price: $${displayedPrice.toLocaleString()}`);

      // Format the listing data for our contract
      return {
        success: true,
        city: randomCity,
        listing: {
          zpid: randomListing.zpid, // Zillow Property ID
          address: randomListing.address,
          price: actualPrice, // The ACTUAL price (hidden from player initially)
          imgSrc: randomListing.imgSrc,
          bedrooms: randomListing.bedrooms,
          bathrooms: randomListing.bathrooms,
          livingArea: randomListing.livingArea,
          homeType: randomListing.homeType,
          latitude: randomListing.latitude,
          longitude: randomListing.longitude
        },
        // Contract-ready format
        contractData: {
          listingId: `0x${randomListing.zpid.toString().padStart(64, '0')}`, // Convert zpid to bytes32
          displayedPrice: displayedPrice, // The DISPLAYED price (shown to player, ±15% of actual)
          actualPrice: actualPrice // Include actual price for reference
        },
        priceInfo: {
          actual: actualPrice,
          displayed: displayedPrice,
          multiplier: multiplier,
          adjustmentPercent: adjustmentPercent
        }
      };
    } else {
      throw new Error('No listings found in the response');
    }
  } catch (error) {
    console.error('Error fetching listing:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// API Routes
app.get('/api/random-listing', async (req, res) => {
  try {
    const listing = await fetchRandomListing();

    if (!listing.success) {
      return res.status(500).json({
        error: 'Failed to fetch listing',
        details: listing.error
      });
    }

    res.json(listing);
  } catch (error) {
    console.error('Error in /api/random-listing:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Zillopoly API server running on port ${PORT}`);
  console.log(`RapidAPI Host: ${process.env.RAPIDAPI_HOST || 'zillow-com1.p.rapidapi.com'}`);
  console.log(`RapidAPI Key configured: ${process.env.RAPIDAPI_KEY ? 'Yes' : 'No'}`);
});
