'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { fetchMarketData } from './actions/market';
import { getCardPrints } from './actions/card-prints';
import { getEbaySoldHistory } from './actions/ebay-search';
import { MarketData } from '@/lib/market-engine';
import { EbayListing, CardPrint } from '@/types/mtg';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { generateMockHistory, MockTransaction } from '@/lib/mock-data';
import { saveToWatchlist, checkPriceChanges, isInWatchlist, removeFromWatchlist, PriceDropAlert } from '@/lib/tracker-logic';
import { saveAlert, hasAlert, PriceAlert } from '@/lib/price-alerts';
import { saveAlert as saveAlertAction } from './actions/price-alerts';

type Timeframe = '7D' | '30D' | '90D';
type AnalyticsTimeFilter = '1D' | '7D' | '14D' | '30D' | '60D' | '90D';

interface PriceDataPoint {
  date: string;
  price: number;
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [cardPrints, setCardPrints] = useState<CardPrint[]>([]);
  const [cardName, setCardName] = useState<string>('');
  const [selectedPrint, setSelectedPrint] = useState<CardPrint | null>(null);
  const [isFoil, setIsFoil] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPrints, setLoadingPrints] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('7D');
  const [analyticsTimeFilter, setAnalyticsTimeFilter] = useState<AnalyticsTimeFilter>('30D');
  const [priceDropAlert, setPriceDropAlert] = useState<PriceDropAlert | null>(null);
  const [isWatched, setIsWatched] = useState(false);
  const [soldHistory, setSoldHistory] = useState<{
    average: number | null;
    median: number | null;
    lowest: number | null;
    count: number;
  } | null>(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [alertScope, setAlertScope] = useState<'specific' | 'any'>('specific');
  const [isSavingAlert, setIsSavingAlert] = useState(false);
  const [showWatchModal, setShowWatchModal] = useState(false);
  const [watchPrint, setWatchPrint] = useState<CardPrint | null>(null);
  const [watchTargetPrice, setWatchTargetPrice] = useState('');
  const [watchScope, setWatchScope] = useState<'specific' | 'any'>('specific');
  const [isSavingWatch, setIsSavingWatch] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoadingPrints(true);
    setError(null);
    setApiErrorMessage(null);
    setPriceDropAlert(null);
    setMarketData(null);
    setSelectedPrint(null);
    setIsFoil(false);
    
    try {
      // First, fetch all prints of the card
      const printsResult = await getCardPrints(searchQuery.trim());
      
      if (printsResult && typeof printsResult === 'object' && 'error' in printsResult) {
        setError(printsResult.error);
        setCardPrints([]);
        setCardName('');
        return;
      }
      
      setCardPrints(printsResult.prints);
      setCardName(printsResult.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch card prints');
      setCardPrints([]);
      setCardName('');
    } finally {
      setLoadingPrints(false);
    }
  };

  const handleVersionSelect = async (print: CardPrint, foil: boolean) => {
    setSelectedPrint(print);
    setIsFoil(foil);
    setLoading(true);
    setError(null);
    setApiErrorMessage(null);
    setPriceDropAlert(null);
    setSoldHistory(null);
    
    try {
      // Fetch market data and sold history in parallel
      const price = foil ? print.foil_price : print.market_price;
      const [marketDataResult, soldHistoryResult] = await Promise.all([
        fetchMarketData(
          cardName,
          print.id,
          print.set_name,
          print.collector_number
        ),
        getEbaySoldHistory(cardName, print.set_name, print.collector_number, price),
      ]);
      
      // Check if market data has an error
      if (marketDataResult && typeof marketDataResult === 'object' && 'error' in marketDataResult) {
        setApiErrorMessage(JSON.stringify(marketDataResult, null, 2));
        setMarketData(null);
        return;
      }
      
      // Update the card data with the selected print's price
      if (marketDataResult && 'card' in marketDataResult) {
        marketDataResult.card.market_price = price;
        marketDataResult.card.image = print.image;
        marketDataResult.card.set = print.set_name;
        marketDataResult.card.collector_number = print.collector_number;
        marketDataResult.card.rarity = print.rarity;
      }
      
      setMarketData(marketDataResult);

      // Handle sold history result
      if (soldHistoryResult && soldHistoryResult.success && 'data' in soldHistoryResult && soldHistoryResult.data) {
        setSoldHistory(soldHistoryResult.data);
      }

      // Check if card is watched and check for price changes
      if (marketDataResult && 'card' in marketDataResult && marketDataResult.card.market_price !== null && marketDataResult.card.market_price > 0) {
        const alert = checkPriceChanges(marketDataResult.card.id, marketDataResult.card.market_price);
        if (alert) {
          setPriceDropAlert(alert);
        }
        setIsWatched(isInWatchlist(marketDataResult.card.id));
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

  const handleSaveAlert = async () => {
    if (!marketData) return;
    
    const targetPriceNum = parseFloat(alertTargetPrice);
    if (isNaN(targetPriceNum) || targetPriceNum <= 0) {
      setError('Please enter a valid target price');
      return;
    }

    setIsSavingAlert(true);
    setError(null);

    try {
      // Validate with server action
      const result = await saveAlertAction({
        cardName: marketData.card.name,
        targetPrice: targetPriceNum,
        scope: alertScope,
        setName: alertScope === 'specific' ? marketData.card.set : undefined,
        collectorNumber: alertScope === 'specific' ? marketData.card.collector_number : undefined,
      });

      if (!result.success) {
        setError(result.error || 'Failed to save alert');
        return;
      }

      // Save to client-side storage and sync to server
      await saveAlert({
        cardName: marketData.card.name,
        targetPrice: targetPriceNum,
        scope: alertScope,
        setName: alertScope === 'specific' ? marketData.card.set : undefined,
        collectorNumber: alertScope === 'specific' ? marketData.card.collector_number : undefined,
      });

      setShowAlertModal(false);
      setAlertTargetPrice('');
      setAlertScope('specific');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save alert');
    } finally {
      setIsSavingAlert(false);
    }
  };

  const handleWatchClick = (print: CardPrint) => {
    setWatchPrint(print);
    setWatchTargetPrice('');
    setWatchScope('specific');
    setShowWatchModal(true);
    setError(null);
  };

  const handleSaveWatch = async () => {
    if (!watchPrint) return;
    
    const targetPriceNum = parseFloat(watchTargetPrice);
    if (isNaN(targetPriceNum) || targetPriceNum <= 0) {
      setError('Please enter a valid target price');
      return;
    }

    setIsSavingWatch(true);
    setError(null);

    try {
      const response = await fetch('/api/watchlist/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardName: cardName,
          cardId: watchPrint.id,
          targetPrice: targetPriceNum,
          scope: watchScope,
          setName: watchScope === 'specific' ? watchPrint.set_name : undefined,
          collectorNumber: watchScope === 'specific' ? watchPrint.collector_number : undefined,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Failed to save watchlist item');
        return;
      }

      setShowWatchModal(false);
      setWatchPrint(null);
      setWatchTargetPrice('');
      setWatchScope('specific');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save watchlist item');
    } finally {
      setIsSavingWatch(false);
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

  // Check if listing is a snipe (less than 85% of Scryfall Market Price)
  const isSnipe = (listingPrice: number, marketPrice: number | null): boolean => {
    if (!marketPrice || marketPrice === 0) return false;
    const percentage = (listingPrice / marketPrice) * 100;
    return percentage < 85;
  };

  // Check if listing is a critical snipe (cheaper than Recent Low)
  const isCriticalSnipe = (listingPrice: number, recentLow: number | null): boolean => {
    if (!recentLow || recentLow === 0) return false;
    return listingPrice < recentLow;
  };

  // Calculate percentage below average sold price
  const getPercentageBelowAverage = (listingPrice: number, averageSold: number | null): number | null => {
    if (!averageSold || averageSold === 0) return null;
    return ((averageSold - listingPrice) / averageSold) * 100;
  };

  // Calculate dollar amount saved
  const getDollarSaved = (listingPrice: number, marketPrice: number | null): number | null => {
    if (!marketPrice || marketPrice === 0) return null;
    return marketPrice - listingPrice;
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
      case '14D':
        filterDate.setDate(filterDate.getDate() - 14);
        break;
      case '30D':
        filterDate.setDate(filterDate.getDate() - 30);
        break;
      case '60D':
        filterDate.setDate(filterDate.getDate() - 60);
        break;
      case '90D':
        filterDate.setDate(filterDate.getDate() - 90);
        break;
    }
    
    return mockTransactions.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      return transactionDate >= filterDate;
    });
  }, [mockTransactions, analyticsTimeFilter]);

  // Calculate stats from filtered transactions (based on selected time frame)
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
              disabled={loadingPrints || !searchQuery.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
            >
              {loadingPrints ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* API Error Message (Raw JSON) */}
        {apiErrorMessage && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg">
            <p className="text-red-200 font-bold mb-2">API Error Response:</p>
            <pre className="text-red-300 text-xs overflow-auto bg-red-950/50 p-3 rounded border border-red-800">
              {apiErrorMessage}
            </pre>
          </div>
        )}

        {/* Price Alert Modal */}
        {showAlertModal && marketData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-800 rounded-xl p-6 border border-zinc-700 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-zinc-100">🔔 Set Price Alert</h3>
                <button
                  onClick={() => {
                    setShowAlertModal(false);
                    setAlertTargetPrice('');
                    setError(null);
                  }}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Target Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={alertTargetPrice}
                    onChange={(e) => setAlertTargetPrice(e.target.value)}
                    placeholder="e.g., 15.00"
                    className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-zinc-100"
                    disabled={isSavingAlert}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Alert Scope
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAlertScope('specific')}
                      disabled={isSavingAlert}
                      className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                        alertScope === 'specific'
                          ? 'bg-purple-600 text-white'
                          : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                      }`}
                    >
                      Specific Version Only
                    </button>
                    <button
                      onClick={() => setAlertScope('any')}
                      disabled={isSavingAlert}
                      className={`flex-1 px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                        alertScope === 'any'
                          ? 'bg-purple-600 text-white'
                          : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                      }`}
                    >
                      Any Printing
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    {alertScope === 'specific'
                      ? `Alert for ${marketData.card.set} #${marketData.card.collector_number || 'N/A'} only`
                      : `Alert for any printing of ${marketData.card.name}`}
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveAlert}
                    disabled={isSavingAlert || !alertTargetPrice}
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition-colors"
                  >
                    {isSavingAlert ? 'Saving...' : 'Save Alert'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAlertModal(false);
                      setAlertTargetPrice('');
                      setError(null);
                    }}
                    disabled={isSavingAlert}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-600 disabled:cursor-not-allowed rounded-lg font-semibold text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Watch Modal */}
        {showWatchModal && watchPrint && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-800 rounded-xl p-6 border border-zinc-700 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-zinc-100">🔔 Watch</h3>
                <button
                  onClick={() => {
                    setShowWatchModal(false);
                    setWatchPrint(null);
                    setWatchTargetPrice('');
                    setWatchScope('specific');
                    setError(null);
                  }}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Notify me when this card is under: $
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={watchTargetPrice}
                    onChange={(e) => setWatchTargetPrice(e.target.value)}
                    placeholder="e.g., 15.00"
                    className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-zinc-100"
                    disabled={isSavingWatch}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Scope:
                  </label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="watchScope"
                        value="specific"
                        checked={watchScope === 'specific'}
                        onChange={() => setWatchScope('specific')}
                        disabled={isSavingWatch}
                        className="w-4 h-4 text-purple-600 bg-zinc-900 border-zinc-700 focus:ring-purple-500 focus:ring-2"
                      />
                      <span className="text-zinc-300">This Printing Only</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="watchScope"
                        value="any"
                        checked={watchScope === 'any'}
                        onChange={() => setWatchScope('any')}
                        disabled={isSavingWatch}
                        className="w-4 h-4 text-purple-600 bg-zinc-900 border-zinc-700 focus:ring-purple-500 focus:ring-2"
                      />
                      <span className="text-zinc-300">Any Printing</span>
                    </label>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    {watchScope === 'specific'
                      ? `Watch for ${watchPrint.set_name} #${watchPrint.collector_number} only`
                      : `Watch for any printing of ${cardName}`}
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSaveWatch}
                    disabled={isSavingWatch || !watchTargetPrice}
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition-colors"
                  >
                    {isSavingWatch ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setShowWatchModal(false);
                      setWatchPrint(null);
                      setWatchTargetPrice('');
                      setWatchScope('specific');
                      setError(null);
                    }}
                    disabled={isSavingWatch}
                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-600 disabled:cursor-not-allowed rounded-lg font-semibold text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Version Selector */}
        {cardPrints.length > 0 && !marketData && (
          <div className="mb-6 bg-zinc-800 rounded-xl p-6 border border-zinc-700">
            <h2 className="text-2xl font-bold mb-4 text-zinc-100">
              Select Version: {cardName}
            </h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {cardPrints.map((print) => {
                const hasFoil = print.finishes.includes('foil');
                const hasNonfoil = print.finishes.includes('nonfoil');
                const canSelectFoil = hasFoil && hasNonfoil;
                
                return (
                  <div key={print.id} className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-zinc-100">{print.set_name}</span>
                          <span className="text-sm text-zinc-400">#{print.collector_number}</span>
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            print.rarity === 'mythic' ? 'bg-purple-600 text-white' :
                            print.rarity === 'rare' ? 'bg-yellow-600 text-white' :
                            print.rarity === 'uncommon' ? 'bg-blue-600 text-white' :
                            'bg-gray-600 text-white'
                          }`}>
                            {print.rarity.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          {print.market_price !== null && (
                            <span className="text-zinc-300">
                              Non-Foil: <span className="font-bold text-green-400">${print.market_price.toFixed(2)}</span>
                            </span>
                          )}
                          {print.foil_price !== null && (
                            <span className="text-zinc-300">
                              Foil: <span className="font-bold text-green-400">${print.foil_price.toFixed(2)}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleWatchClick(print)}
                          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-semibold text-sm transition-colors text-white"
                        >
                          🔔 Watch
                        </button>
                        {hasNonfoil && (
                          <button
                            onClick={() => handleVersionSelect(print, false)}
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-semibold text-sm transition-colors"
                          >
                            {loading ? 'Loading...' : 'Select Non-Foil'}
                          </button>
                        )}
                        {hasFoil && (
                          <button
                            onClick={() => handleVersionSelect(print, true)}
                            disabled={loading}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-semibold text-sm transition-colors"
                          >
                            {loading ? 'Loading...' : 'Select Foil'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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

            {/* Market Pulse Section */}
            <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-6 border-2 border-purple-500/50">
              <h2 className="text-2xl font-bold mb-6 text-zinc-100">📊 Market Pulse</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Average Sold (Last 90 Days) */}
                <div className="bg-zinc-900/80 rounded-lg p-6 border border-purple-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">📈</span>
                    <p className="text-zinc-400 text-sm font-semibold uppercase tracking-wide">Average Sold</p>
                  </div>
                  <p className="text-3xl font-bold text-purple-400">
                    {soldHistory?.average !== null && soldHistory?.average !== undefined
                      ? `$${soldHistory.average.toFixed(2)}`
                      : soldHistory?.count === 0
                      ? 'No recent sales found'
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {soldHistory?.count !== undefined && soldHistory.count > 0
                      ? `Based on ${soldHistory.count} recent sales`
                      : 'Last 90 Days'}
                  </p>
                </div>

                {/* Recent Low (The Floor) */}
                <div className="bg-zinc-900/80 rounded-lg p-6 border border-red-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">📉</span>
                    <p className="text-zinc-400 text-sm font-semibold uppercase tracking-wide">Recent Low</p>
                  </div>
                  <p className="text-3xl font-bold text-red-400">
                    {soldHistory?.lowest !== null && soldHistory?.lowest !== undefined
                      ? `$${soldHistory.lowest.toFixed(2)}`
                      : soldHistory?.count === 0
                      ? 'No recent sales found'
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">The Floor</p>
                </div>

                {/* Scryfall Market Price */}
                <div className="bg-zinc-900/80 rounded-lg p-6 border border-blue-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">💎</span>
                    <p className="text-zinc-400 text-sm font-semibold uppercase tracking-wide">Scryfall Market</p>
                  </div>
                  <p className="text-3xl font-bold text-blue-400">
                    {marketData.card.market_price !== null
                      ? `$${marketData.card.market_price.toFixed(2)}`
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Current Market Price</p>
                </div>
              </div>
            </div>

            {/* Card Info and Listings Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Side - Card Image and Market Price */}
              <div className="bg-zinc-800 rounded-xl p-6 border border-zinc-700">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-2xl font-bold text-zinc-100">{marketData.card.name}</h2>
                  <div className="flex gap-2">
                    {/* Price Alert Button */}
                    <button
                      onClick={() => setShowAlertModal(true)}
                      className="px-4 py-2 rounded-lg font-semibold text-sm transition-colors bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      🔔 Set Price Alert
                    </button>
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
                      const isSnipeListing = isSnipe(listing.price, marketData.card.market_price);
                      const isCritical = isCriticalSnipe(listing.price, soldHistory?.lowest || null);
                      const percentageBelowAverage = getPercentageBelowAverage(listing.price, soldHistory?.average || null);
                      const dollarSaved = getDollarSaved(listing.price, marketData.card.market_price);
                      
                      // Determine styling: Critical takes priority, then Snipe, then normal
                      const getBorderClass = () => {
                        if (isCritical) return 'border-red-500 bg-red-500/20 shadow-lg shadow-red-500/50 animate-pulse';
                        if (isSnipeListing) return 'border-green-500 bg-green-500/10 shadow-lg shadow-green-500/50';
                        return 'border-zinc-700 bg-zinc-700/50 hover:border-zinc-600';
                      };
                      
                      return (
                        <a
                          key={index}
                          href={listing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`block p-4 rounded-lg border-2 transition-all hover:scale-[1.02] ${getBorderClass()}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              {isCritical && (
                                <span className="inline-flex items-center gap-1 px-3 py-1 mb-2 bg-red-600 text-white text-sm font-bold rounded animate-pulse">
                                  🔥 CRITICAL SNIPE
                                </span>
                              )}
                              {isSnipeListing && !isCritical && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 mb-2 bg-green-600 text-white text-xs font-bold rounded">
                                  🔥 SNIPE ALERT
                                </span>
                              )}
                              <p className="text-zinc-200 font-medium line-clamp-2 mb-1">
                                {listing.title}
                              </p>
                              <div className="flex items-baseline gap-2">
                                <p className="text-lg font-bold text-green-400">
                                  ${listing.price.toFixed(2)}
                                </p>
                                {dollarSaved !== null && dollarSaved > 0 && (
                                  <p className="text-sm font-semibold text-green-500">
                                    -${dollarSaved.toFixed(2)}
                                  </p>
                                )}
                              </div>
                              {percentageBelowAverage !== null && (
                                <p className="text-xs text-zinc-400 mt-1 font-medium">
                                  {percentageBelowAverage.toFixed(1)}% below average sold price
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
                {/* Time Filter Buttons - Note: Stats use eBay sold data (last 90 days), filter only affects transaction table */}
                <div className="flex gap-2 flex-wrap">
                  {(['1D', '7D', '14D', '30D', '60D', '90D'] as AnalyticsTimeFilter[]).map((filter) => (
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
              
              {/* Stats Row - Calculated from transactions shown in table below */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Average Price */}
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
                  <p className="text-zinc-400 text-sm mb-1">Average Price</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {transactionStats.averagePrice !== null
                      ? `$${transactionStats.averagePrice.toFixed(2)}`
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Mean of transactions shown below ({analyticsTimeFilter})</p>
                </div>

                {/* Median Price */}
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
                  <p className="text-zinc-400 text-sm mb-1">Median Price</p>
                  <p className="text-2xl font-bold text-purple-400">
                    {transactionStats.medianPrice !== null
                      ? `$${transactionStats.medianPrice.toFixed(2)}`
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Middle value of transactions shown below</p>
                </div>

                {/* Volume */}
                <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
                  <p className="text-zinc-400 text-sm mb-1">Volume</p>
                  <p className="text-2xl font-bold text-green-400">
                    {transactionStats.volume}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">Total transactions shown below</p>
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
                        {filteredTransactions.map((transaction, index) => {
                          // Generate eBay URL for eBay transactions
                          const isEbayTransaction = transaction.source.startsWith('eBay');
                          const cardName = marketData?.card.name || '';
                          const ebayUrl = isEbayTransaction && cardName
                            ? `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(cardName)}&LH_Sold=1&_sop=13`
                            : null;

                          if (ebayUrl) {
                            return (
                              <tr
                                key={index}
                                onClick={() => window.open(ebayUrl, '_blank', 'noopener,noreferrer')}
                                className="hover:bg-zinc-800/50 transition-colors cursor-pointer"
                              >
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
                                  <span className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1.5">
                                    {transaction.source}
                                    <svg
                                      className="w-3 h-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      aria-hidden="true"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                      />
                                    </svg>
                                  </span>
                                </td>
                              </tr>
                            );
                          }

                          return (
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
                          );
                        })}
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
