'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { fetchMarketData } from './actions/market';
import { MarketData } from '@/lib/market-engine';
import { EbayListing } from '@/types/mtg';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { generateMockHistory, MockTransaction } from '@/lib/mock-data';
import { saveToWatchlist, checkPriceChanges, isInWatchlist, removeFromWatchlist, PriceDropAlert } from '@/lib/tracker-logic';

type Timeframe = '7D' | '30D' | '90D';
type AnalyticsTimeFilter = '1D' | '7D' | '30D' | 'ALL';

interface PriceDataPoint {
  date: string;
  price: number;
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('7D');
  const [analyticsTimeFilter, setAnalyticsTimeFilter] = useState<AnalyticsTimeFilter>('30D');
  const [priceDropAlert, setPriceDropAlert] = useState<PriceDropAlert | null>(null);
  const [isWatched, setIsWatched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    setPriceDropAlert(null);
    try {
      const data = await fetchMarketData(searchQuery.trim());
      setMarketData(data);

      // Check if card is watched and check for price changes
      if (data.card.market_price !== null && data.card.market_price > 0) {
        const alert = checkPriceChanges(data.card.id, data.card.market_price);
        if (alert) {
          setPriceDropAlert(alert);
        }
        setIsWatched(isInWatchlist(data.card.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch market data');
      setMarketData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleWatchToggle = () => {
    if (!marketData?.card.market_price || marketData.card.market_price === 0) return;

    if (isWatched) {
      removeFromWatchlist(marketData.card.id);
      setIsWatched(false);
    } else {
      saveToWatchlist(marketData.card.id, marketData.card.market_price);
      setIsWatched(true);
    }
  };

  // Check watchlist status when marketData changes
  useEffect(() => {
    if (marketData?.card.id) {
      setIsWatched(isInWatchlist(marketData.card.id));
    }
  }, [marketData?.card.id]);

  // Get top 5 cheapest listings
  const topListings = marketData
    ? [...marketData.ebayListings]
        .sort((a, b) => a.price - b.price)
        .slice(0, 5)
    : [];

  // Check if listing is a snipe (10% or more below market price)
  const isSnipe = (listing: EbayListing, marketPrice: number | null): boolean => {
    if (!marketPrice || marketPrice === 0) return false;
    const discountPercent = ((marketPrice - listing.price) / marketPrice) * 100;
    return discountPercent >= 10;
  };

  // Generate eBay sold listings URL
  const getSoldListingsUrl = (cardName: string): string => {
    const encodedName = encodeURIComponent(cardName);
    return `https://www.ebay.com/sch/i.html?_nkw=${encodedName}&_in_kw=1&_ex_kw=&_sacat=0&LH_Sold=1&_udlo=&_udhi=&_samilow=&_samihi=&_sadis=15&_stpos=&_sargn=-1%26saslc%3D1&_salic=1&_sop=13&_dmd=1&_ipg=50`;
  };

  // Generate mock price trend data based on timeframe
  const generatePriceTrendData = (basePrice: number | null, days: number): PriceDataPoint[] => {
    if (!basePrice || basePrice === 0) return [];
    
    const data: PriceDataPoint[] = [];
    const today = new Date();
    const variance = basePrice * 0.15; // 15% variance for mock data
    
    for (let i = days; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Generate mock price with some variation
      const randomVariation = (Math.random() - 0.5) * variance;
      const price = Math.max(0.01, basePrice + randomVariation);
      
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: Number(price.toFixed(2)),
      });
    }
    
    return data;
  };

  // Calculate analytics stats
  const analyticsStats = useMemo(() => {
    if (!marketData?.card.market_price || marketData.card.market_price === 0) {
      return {
        avgSalePrice: null,
        marketVolume: null,
        priceVolatility: null,
        priceSpread: null,
      };
    }

    const basePrice = marketData.card.market_price;
    const foilPrice = marketData.card.prices?.usd_foil;
    
    // Calculate price spread between foil and non-foil
    const priceSpread = foilPrice && basePrice
      ? ((foilPrice - basePrice) / basePrice) * 100
      : null;

    // Mock average sale price (using base price with slight variation)
    const avgSalePrice = basePrice * (0.95 + Math.random() * 0.1);

    // Mock market volume (based on eBay listings count)
    const marketVolume = marketData.ebayListings.length;

    // Calculate price volatility (standard deviation of mock trend data)
    const trendData = generatePriceTrendData(basePrice, timeframe === '7D' ? 7 : timeframe === '30D' ? 30 : 90);
    const prices = trendData.map(d => d.price);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    const volatility = Math.sqrt(variance);

    return {
      avgSalePrice: avgSalePrice,
      marketVolume: marketVolume,
      priceVolatility: volatility,
      priceSpread: priceSpread,
    };
  }, [marketData, timeframe]);

  // Get price trend data for chart
  const priceTrendData = useMemo(() => {
    if (!marketData?.card.market_price) return [];
    const days = timeframe === '7D' ? 7 : timeframe === '30D' ? 30 : 90;
    return generatePriceTrendData(marketData.card.market_price, days);
  }, [marketData, timeframe]);

  // Generate and filter mock transaction history
  const mockTransactions = useMemo(() => {
    if (!marketData?.card.market_price || marketData.card.market_price === 0) return [];
    return generateMockHistory(marketData.card.market_price);
  }, [marketData]);

  // Filter transactions based on selected time filter
  const filteredTransactions = useMemo(() => {
    if (!mockTransactions.length) return [];
    
    const now = new Date();
    const filterDate = new Date(now);
    
    switch (analyticsTimeFilter) {
      case '1D':
        filterDate.setDate(filterDate.getDate() - 1);
        break;
      case '7D':
        filterDate.setDate(filterDate.getDate() - 7);
        break;
      case '30D':
        filterDate.setDate(filterDate.getDate() - 30);
        break;
      case 'ALL':
        return mockTransactions;
    }
    
    return mockTransactions.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      return transactionDate >= filterDate;
    });
  }, [mockTransactions, analyticsTimeFilter]);

  // Calculate stats from filtered transactions
  const transactionStats = useMemo(() => {
    if (!filteredTransactions.length) {
      return {
        averagePrice: null,
        medianPrice: null,
        volume: 0,
      };
    }

    const prices = filteredTransactions.map(t => t.price).sort((a, b) => a - b);
    const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const medianPrice = prices.length % 2 === 0
      ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : prices[Math.floor(prices.length / 2)];
    const volume = filteredTransactions.length;

    return {
      averagePrice,
      medianPrice,
      volume,
    };
  }, [filteredTransactions]);

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            MTG Price Tracker
          </h1>
          <p className="text-zinc-400">Track Magic: The Gathering card prices across Scryfall and eBay</p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter card name (e.g., Lightning Bolt)"
              className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-zinc-100 placeholder-zinc-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !searchQuery.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* Market Data Display */}
        {marketData && (
          <div className="space-y-6">
            {/* Price Drop Alert Banner */}
            {priceDropAlert && (
              <div className="bg-orange-900/50 border-2 border-orange-500 rounded-xl p-4 flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-orange-200 font-bold text-lg">PRICE DROP DETECTED</p>
                  <p className="text-orange-300 text-sm">
                    Price dropped {priceDropAlert.percentageChange.toFixed(1)}% from ${priceDropAlert.oldPrice.toFixed(2)} to ${priceDropAlert.newPrice.toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={() => setPriceDropAlert(null)}
                  className="text-orange-300 hover:text-orange-100 transition-colors"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Card Info and Listings Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Side - Card Image and Market Price */}
              <div className="bg-zinc-800 rounded-xl p-6 border border-zinc-700">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-2xl font-bold text-zinc-100">{marketData.card.name}</h2>
                  {/* Watch Button */}
                  <button
                    onClick={handleWatchToggle}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                      isWatched
                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                        : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                    }`}
                  >
                    {isWatched ? '✓ Watched' : 'Watch'}
                  </button>
                </div>
                <div className="space-y-4">
                  {/* Card Image */}
                  {marketData.card.image && (
                    <div className="relative aspect-[5/7] rounded-lg overflow-hidden bg-zinc-900">
                      <Image
                        src={marketData.card.image}
                        alt={marketData.card.name}
                        fill
                        className="object-contain"
                        priority
                      />
                    </div>
                  )}

                  {/* Market Price */}
                  <div className="pt-4 border-t border-zinc-700">
                    <div className="flex items-baseline justify-between">
                      <span className="text-zinc-400 text-sm uppercase tracking-wide">Market Price</span>
                      <span className="text-3xl font-bold text-blue-400">
                        {marketData.card.market_price !== null
                          ? `$${marketData.card.market_price.toFixed(2)}`
                          : 'N/A'}
                      </span>
                    </div>
                    <p className="text-zinc-500 text-sm mt-1">Set: {marketData.card.set}</p>
                  </div>

                  {/* View Sold Transactions Button */}
                  <a
                    href={getSoldListingsUrl(marketData.card.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full mt-4 px-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold text-center transition-colors"
                  >
                    View Sold Transactions
                  </a>
                </div>
              </div>

              {/* Right Side - eBay Listings */}
              <div className="bg-zinc-800 rounded-xl p-6 border border-zinc-700">
                <h2 className="text-2xl font-bold mb-4 text-zinc-100">
                  Top 5 Cheapest Listings
                </h2>
                {topListings.length > 0 ? (
                  <div className="space-y-3">
                    {topListings.map((listing, index) => {
                      const isSnipeListing = isSnipe(listing, marketData.card.market_price);
                      return (
                        <a
                          key={index}
                          href={listing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`block p-4 rounded-lg border-2 transition-all hover:scale-[1.02] ${
                            isSnipeListing
                              ? 'border-green-500 bg-green-500/10 shadow-lg shadow-green-500/50'
                              : 'border-zinc-700 bg-zinc-700/50 hover:border-zinc-600'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              {isSnipeListing && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 mb-2 bg-green-600 text-white text-xs font-bold rounded">
                                  🎯 SNIPE
                                </span>
                              )}
                              <p className="text-zinc-200 font-medium line-clamp-2 mb-1">
                                {listing.title}
                              </p>
                              <p className="text-lg font-bold text-green-400">
                                ${listing.price.toFixed(2)}
                              </p>
                              {marketData.card.market_price && (
                                <p className="text-xs text-zinc-500 mt-1">
                                  {((marketData.card.market_price - listing.price) / marketData.card.market_price * 100).toFixed(1)}% below market
                                </p>
                              )}
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-zinc-500">
                    No eBay listings found for this card.
                  </div>
                )}
              </div>
            </div>

            {/* Market Analytics Section */}
            <div className="bg-zinc-800 rounded-xl p-6 border border-zinc-700">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-zinc-100">Market Analytics</h2>
                {/* Time Filter Buttons */}
                <div className="flex gap-2">
                  {(['1D', '7D', '30D', 'ALL'] as AnalyticsTimeFilter[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setAnalyticsTimeFilter(filter)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        analyticsTimeFilter === filter
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Stats Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Average Price */}
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
                  <p className="text-zinc-400 text-sm mb-1">Average Price</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {transactionStats.averagePrice !== null
                      ? `$${transactionStats.averagePrice.toFixed(2)}`
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Mean of last {analyticsTimeFilter === 'ALL' ? 'all' : analyticsTimeFilter}</p>
                </div>

                {/* Median Price */}
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
                  <p className="text-zinc-400 text-sm mb-1">Median Price</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {transactionStats.medianPrice !== null
                      ? `$${transactionStats.medianPrice.toFixed(2)}`
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Middle value of sales</p>
                </div>

                {/* Volume */}
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
                  <p className="text-zinc-400 text-sm mb-1">Volume</p>
                  <p className="text-2xl font-bold text-green-400">
                    {transactionStats.volume}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Total transactions</p>
                </div>
              </div>

              {/* Transaction Table */}
              <div className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden">
                <div className="p-4 border-b border-zinc-700">
                  <h3 className="text-lg font-semibold text-zinc-100">Recent Transactions</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {filteredTransactions.length > 0 ? (
                    <table className="w-full">
                      <thead className="bg-zinc-800 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Price</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Condition</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-700">
                        {filteredTransactions.map((transaction, index) => (
                          <tr key={index} className="hover:bg-zinc-800/50 transition-colors">
                            <td className="px-4 py-3 text-sm text-zinc-300">
                              {new Date(transaction.date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-green-400">
                              ${transaction.price.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm text-zinc-300">
                              {transaction.condition}
                            </td>
                            <td className="px-4 py-3 text-sm text-zinc-300">
                              {transaction.source}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-zinc-500">
                      No transactions found for the selected period.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!marketData && !loading && !error && (
          <div className="text-center py-16">
            <div className="inline-block p-4 bg-zinc-800 rounded-full mb-4">
              <svg
                className="w-12 h-12 text-zinc-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <p className="text-zinc-400 text-lg">Search for a card to see market data</p>
          </div>
        )}
      </div>
    </div>
  );
}
