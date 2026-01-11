'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Edit2, Bell, BellOff, Plus, X, Circle } from 'lucide-react';

interface WatchlistItem {
  id: string;
  cardName: string;
  targetPrice: number;
  setName?: string;
  createdAt: string;
}

interface StatusData {
  database: 'connected' | 'disconnected';
  lastCheck: string | null;
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string>('');
  
  // Add card form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [cardName, setCardName] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [setName, setSetName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  // Autocomplete state
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const autocompleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  
  // Search history state
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  
  // Status state
  const [status, setStatus] = useState<StatusData>({
    database: 'disconnected',
    lastCheck: null,
  });

  useEffect(() => {
    fetchWatchlist();
    checkNotificationPermission();
    loadSearchHistory();
    fetchStatus();
    
    // Refresh status every 30 seconds
    const statusInterval = setInterval(fetchStatus, 30000);
    
    return () => {
      if (autocompleteTimeoutRef.current) {
        clearTimeout(autocompleteTimeoutRef.current);
      }
      clearInterval(statusInterval);
    };
  }, []);

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      if (data.success) {
        setStatus({
          database: data.database,
          lastCheck: data.lastCheck,
        });
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  };

  const loadSearchHistory = () => {
    if (typeof window === 'undefined') return;
    
    try {
      const history = localStorage.getItem('mtg_sniper_search_history');
      if (history) {
        const parsed = JSON.parse(history);
        setSearchHistory(Array.isArray(parsed) ? parsed.slice(0, 5) : []);
      }
    } catch (err) {
      console.error('Failed to load search history:', err);
    }
  };

  const saveToSearchHistory = (cardName: string) => {
    if (typeof window === 'undefined') return;
    
    try {
      const history = localStorage.getItem('mtg_sniper_search_history');
      let historyArray: string[] = history ? JSON.parse(history) : [];
      
      // Remove if already exists and add to front
      historyArray = historyArray.filter(name => name.toLowerCase() !== cardName.toLowerCase());
      historyArray.unshift(cardName);
      
      // Keep only last 5
      historyArray = historyArray.slice(0, 5);
      
      localStorage.setItem('mtg_sniper_search_history', JSON.stringify(historyArray));
      setSearchHistory(historyArray);
    } catch (err) {
      console.error('Failed to save search history:', err);
    }
  };

  const clearSearchHistory = () => {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem('mtg_sniper_search_history');
      setSearchHistory([]);
    } catch (err) {
      console.error('Failed to clear search history:', err);
    }
  };

  const fetchAutocompleteSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setAutocompleteSuggestions([]);
      setShowAutocomplete(false);
      return;
    }

    setIsLoadingSuggestions(true);
    
    try {
      const response = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      if (data.data && Array.isArray(data.data)) {
        setAutocompleteSuggestions(data.data.slice(0, 10)); // Limit to 10 suggestions
        setShowAutocomplete(true);
      } else {
        setAutocompleteSuggestions([]);
        setShowAutocomplete(false);
      }
    } catch (err) {
      console.error('Autocomplete error:', err);
      setAutocompleteSuggestions([]);
      setShowAutocomplete(false);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  const handleCardNameChange = (value: string) => {
    setCardName(value);
    setShowAutocomplete(false);

    // Clear existing timeout
    if (autocompleteTimeoutRef.current) {
      clearTimeout(autocompleteTimeoutRef.current);
    }

    // Debounce autocomplete
    autocompleteTimeoutRef.current = setTimeout(() => {
      fetchAutocompleteSuggestions(value);
    }, 300);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setCardName(suggestion);
    setShowAutocomplete(false);
  };

  const handleHistoryChipClick = (cardName: string) => {
    setCardName(cardName);
    setShowAutocomplete(false);
  };

  const checkNotificationPermission = () => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  };

  const fetchWatchlist = async () => {
    try {
      const response = await fetch('/api/watchlist');
      const data = await response.json();
      if (data.success) {
        setItems(data.items || []);
      } else {
        setError(data.error || 'Failed to fetch watchlist');
      }
    } catch (err) {
      setError('Failed to fetch watchlist');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCard = async () => {
    if (!cardName.trim()) {
      setError('Card name is required');
      return;
    }

    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) {
      setError('Please enter a valid target price');
      return;
    }

    setIsAdding(true);
    setError(null);

    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardName: cardName.trim(),
          targetPrice: price,
          setName: setName.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Save to search history
        saveToSearchHistory(cardName.trim());
        
        // Reset form
        setCardName('');
        setTargetPrice('');
        setSetName('');
        setShowAddForm(false);
        
        // Refresh watchlist
        fetchWatchlist();
      } else {
        setError(data.error || 'Failed to add card to watchlist');
      }
    } catch (err) {
      setError('Failed to add card to watchlist');
      console.error(err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this item from your watchlist?')) {
      return;
    }

    try {
      const response = await fetch(`/api/watchlist?id=${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        setItems(items.filter(item => item.id !== id));
      } else {
        setError(data.error || 'Failed to delete item');
      }
    } catch (err) {
      setError('Failed to delete item');
      console.error(err);
    }
  };

  const handleEdit = (item: WatchlistItem) => {
    setEditingId(item.id);
    setEditPrice(item.targetPrice.toString());
  };

  const handleSaveEdit = async (id: string) => {
    const newPrice = parseFloat(editPrice);
    if (isNaN(newPrice) || newPrice <= 0) {
      setError('Please enter a valid price');
      return;
    }

    try {
      const item = items.find(i => i.id === id);
      if (!item) return;

      const response = await fetch(`/api/watchlist?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const addResponse = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardName: item.cardName,
            targetPrice: newPrice,
            setName: item.setName,
          }),
        });

        const addData = await addResponse.json();
        if (addData.success) {
          setEditingId(null);
          fetchWatchlist();
        } else {
          setError(addData.error || 'Failed to update item');
        }
      }
    } catch (err) {
      setError('Failed to update item');
      console.error(err);
    }
  };

  const handleEnableNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setError('Push notifications are not supported in this browser');
      return;
    }

    setIsSubscribing(true);
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission !== 'granted') {
        setError('Notification permission was denied');
        setIsSubscribing(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setError('VAPID public key is not configured');
        setIsSubscribing(false);
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });

      const data = await response.json();
      if (data.success) {
        alert('Notifications enabled successfully! You will now receive alerts when cards match your target prices.');
      } else {
        setError(data.error || 'Failed to enable notifications');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to enable notifications');
      console.error(err);
    } finally {
      setIsSubscribing(false);
    }
  };

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatLastCheck = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading watchlist...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-4 px-4 safe-bottom">
      <div className="max-w-4xl mx-auto">
        {/* Status Dashboard */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">System Status</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Circle 
                className={`w-3 h-3 ${status.database === 'connected' ? 'text-green-500 fill-green-500' : 'text-red-500 fill-red-500'}`} 
              />
              <span className="text-sm text-gray-600">
                Database: <span className={`font-medium ${status.database === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                  {status.database === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Circle 
                className={`w-3 h-3 ${
                  notificationPermission === 'granted' 
                    ? 'text-green-500 fill-green-500' 
                    : notificationPermission === 'default'
                    ? 'text-yellow-500 fill-yellow-500'
                    : 'text-red-500 fill-red-500'
                }`} 
              />
              <span className="text-sm text-gray-600">
                Notifications: <span className={`font-medium ${
                  notificationPermission === 'granted' 
                    ? 'text-green-600' 
                    : notificationPermission === 'default'
                    ? 'text-yellow-600'
                    : 'text-red-600'
                }`}>
                  {notificationPermission === 'granted' ? 'Enabled' : notificationPermission === 'default' ? 'Pending' : 'Denied'}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                Last Check: <span className="font-medium text-gray-900">{formatLastCheck(status.lastCheck)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">Watchlist</h1>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add Card
              </button>
            )}
          </div>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* Add Card Form */}
          {showAddForm && (
            <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Add Card to Watchlist</h2>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setCardName('');
                    setTargetPrice('');
                    setSetName('');
                    setShowAutocomplete(false);
                    setError(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search History */}
              {searchHistory.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Recently Searched</span>
                    <button
                      onClick={clearSearchHistory}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {searchHistory.map((name, index) => (
                      <button
                        key={index}
                        onClick={() => handleHistoryChipClick(name)}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200 transition-colors"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Card Name Input with Autocomplete */}
              <div className="mb-4 relative" ref={autocompleteRef}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Card Name *
                </label>
                <input
                  type="text"
                  value={cardName}
                  onChange={(e) => handleCardNameChange(e.target.value)}
                  placeholder="Enter card name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  autoComplete="off"
                />
                {showAutocomplete && autocompleteSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {isLoadingSuggestions ? (
                      <div className="px-4 py-2 text-gray-500 text-sm">Loading...</div>
                    ) : (
                      autocompleteSuggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-900 text-sm"
                        >
                          {suggestion}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Price ($) *
                  </label>
                  <input
                    type="number"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Set Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={setName}
                    onChange={(e) => setSetName(e.target.value)}
                    placeholder="e.g., Modern Horizons 3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleAddCard}
                  disabled={isAdding}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isAdding ? 'Adding...' : 'Add to Watchlist'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setCardName('');
                    setTargetPrice('');
                    setSetName('');
                    setShowAutocomplete(false);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Notifications Button */}
          <div className="mb-4">
            <button
              onClick={handleEnableNotifications}
              disabled={isSubscribing || notificationPermission === 'granted'}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                notificationPermission === 'granted'
                  ? 'bg-green-100 text-green-700 cursor-not-allowed'
                  : isSubscribing
                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {notificationPermission === 'granted' ? (
                <>
                  <Bell className="w-5 h-5" />
                  Notifications Enabled
                </>
              ) : (
                <>
                  <BellOff className="w-5 h-5" />
                  {isSubscribing ? 'Enabling...' : 'Enable Notifications'}
                </>
              )}
            </button>
            {notificationPermission !== 'granted' && (
              <p className="text-sm text-gray-600 mt-2">
                Enable notifications to receive alerts when cards match your target prices.
              </p>
            )}
          </div>
        </div>

        {/* Watchlist Items */}
        {items.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <p className="text-gray-600 text-lg">Your watchlist is empty</p>
            <p className="text-gray-500 text-sm mt-2">
              Add cards to your watchlist to receive price alerts
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {item.cardName}
                    </h3>
                    {item.setName && (
                      <p className="text-sm text-gray-600 mb-3">{item.setName}</p>
                    )}
                    <div className="flex items-center gap-6 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Target Price: </span>
                        {editingId === item.id ? (
                          <div className="inline-flex items-center gap-2">
                            <input
                              type="number"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-gray-900"
                              step="0.01"
                              min="0.01"
                            />
                            <button
                              onClick={() => handleSaveEdit(item.id)}
                              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="text-blue-600 font-semibold">
                            ${item.targetPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="font-medium">Date Set: </span>
                        {formatDate(item.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {editingId !== item.id && (
                      <>
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
