import { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Switch,
  TouchableOpacity,
} from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { Alert, Pressable } from 'react-native';

type Entry = {
  id: string;
  text: string;
  mood: number | null;
  created_at: string | null;
  lat: number | null;
  lng: number | null;
  weather: string | null;
  temperature: number | null;
  user_id: string;
};

const TABLE = 'data';

export default function HomeScreen() {
  const [text, setText] = useState<string>('');
  const [mood, setMood] = useState<string>('3');
  const [useLocation, setUseLocation] = useState<boolean>(false);

  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  const fetchItems = useCallback(async () => {
    if (!userId) return;
    
    setRefreshing(true);
    setError(null);

    const { data, error: qErr } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId) // Filter by current user
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<Entry[]>();

    if (qErr) setError(qErr.message);
    setItems(data ?? []);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    if (userId) {
      (async () => {
        setLoading(true);
        await fetchItems();
        setLoading(false);
      })();
    }
  }, [fetchItems, userId]);

  const addItem = async () => {
    if (!userId) {
      setError('User not authenticated');
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    setInserting(true);
    setError(null);

    let lat: number | null = null;
    let lng: number | null = null;
    let weather: string | null = null;
    let temperature: number | null = null;

    if (useLocation) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const pos = await Location.getCurrentPositionAsync({});
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          const w = await fetchWeather(lat, lng);
          weather = w.weather;
          temperature = w.temperature;
        } catch (locationError) {
          console.warn('Location fetch failed:', locationError);
        }
      }
    }

    const moodNumber = Math.min(5, Math.max(1, parseInt(mood, 10) || 3));

    const { error: insErr } = await supabase
      .from(TABLE)
      .insert({ 
        text: trimmed, 
        mood: moodNumber, 
        lat, 
        lng, 
        weather, 
        temperature,
        user_id: userId // Include user_id
      });

    if (insErr) {
      setError(insErr.message);
    } else {
      // Simple success alert instead of notification
      Alert.alert(
        "Success! ✅",
        `Mood ${moodNumber} entry saved${weather ? ` with ${weather} weather` : ''}`
      );
    }
    
    setText('');
    await fetchItems();
    setInserting(false);
  };

  const renderItem = ({ item }: { item: Entry }) => {
    const when = item.created_at ? new Date(item.created_at).toLocaleString() : '';
    const moodEmoji = item.mood ? ['😢', '😕', '😐', '😊', '😄'][item.mood - 1] : '';

    const onPressRow = () => {
      const weatherInfo = item.weather ? `\nWeather: ${item.weather}` : '';
      const tempInfo = item.temperature ? `, ${item.temperature.toFixed(1)}°C` : '';
      const locationInfo = (item.lat && item.lng) ? `\nLocation: ${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}` : '';
      
      Alert.alert(
        `${moodEmoji} Entry Details`,
        `"${item.text}"\n\n${when}\nMood: ${item.mood}/5${weatherInfo}${tempInfo}${locationInfo}`,
        [{ text: 'OK' }]
      );
    };

    return (
      <Pressable onPress={onPressRow} style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#f0f0f0' }]}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowText}>{moodEmoji} {item.text}</Text>
          <Text style={styles.moodBadge}>Mood {item.mood}</Text>
        </View>
        <Text style={styles.rowMeta}>{when}</Text>
        {(item.weather || item.temperature) && (
          <Text style={styles.rowMeta}>
            {item.weather ? `🌤️ ${item.weather}` : ''}
            {item.temperature != null ? `, ${item.temperature.toFixed(1)}°C` : ''}
          </Text>
        )}
        {item.lat != null && item.lng != null && (
          <Text style={styles.rowMetaSmall}>
            📍 {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
          </Text>
        )}
      </Pressable>
    );
  };

  const WEATHER_API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;

  async function fetchWeather(
    lat: number,
    lng: number
  ): Promise<{ weather: string | null; temperature: number | null }> {
    if (!WEATHER_API_KEY) {
      console.warn("Weather API key not configured");
      return { weather: null, temperature: null };
    }

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${WEATHER_API_KEY}&units=metric`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Weather API error: ${resp.status}`);
      
      const data = await resp.json();

      if (data.weather && data.weather.length > 0) {
        return {
          weather: data.weather[0].main,
          temperature: data.main?.temp ?? null,
        };
      }
    } catch (err) {
      console.error("Weather fetch failed:", err);
    }
    return { weather: null, temperature: null };
  }

  if (!userId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.container, { justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color="#0066cc" />
          <Text style={styles.loadingText}>Loading user data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Mood Journal 📱</Text>
        <Text style={styles.desc}>Track your daily mood, location, and weather!</Text>

        <View style={styles.formContainer}>
          <View style={styles.formRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="How are you feeling today?"
              placeholderTextColor="#727272ff"
              style={styles.input}
              editable={!inserting}
              multiline
              numberOfLines={2}
            />
            <Button
              title={inserting ? 'Saving…' : 'Save'}
              onPress={addItem}
              disabled={inserting || !text.trim()}
              color="#0066cc"
            />
          </View>
          
          <View style={styles.moodRow}>
            <Text style={styles.moodLabel}>Select your mood (1-5):</Text>
            <View style={styles.moodButtons}>
              {[1, 2, 3, 4, 5].map(num => (
                <TouchableOpacity
                  key={num}
                  style={[
                    styles.moodButton,
                    parseInt(mood) === num && styles.moodButtonActive
                  ]}
                  onPress={() => setMood(num.toString())}
                  disabled={inserting}
                >
                  <Text style={styles.moodButtonText}>
                    {['😢', '😕', '😐', '😊', '😄'][num - 1]}
                  </Text>
                  <Text style={styles.moodNumber}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.switchWrap}>
            <Text style={styles.switchLabel}>📍 Include location & weather data</Text>
            <Switch 
              value={useLocation} 
              onValueChange={setUseLocation} 
              disabled={inserting}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={useLocation ? '#0066cc' : '#f4f3f4'}
            />
          </View>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.error}>⚠️ {error}</Text>
          </View>
        )}

        <View style={styles.entriesHeader}>
          <Text style={styles.entriesTitle}>Your Recent Entries</Text>
          <Text style={styles.entriesCount}>({items.length} total)</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0066cc" />
            <Text style={styles.loadingText}>Loading entries...</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            renderItem={renderItem}
            refreshControl={
              <RefreshControl 
                refreshing={refreshing} 
                onRefresh={fetchItems}
                tintColor="#0066cc"
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>🌟</Text>
                <Text style={styles.empty}>No entries yet!</Text>
                <Text style={styles.emptySubtext}>Add your first mood entry above</Text>
              </View>
            }
            style={styles.list}
            contentContainerStyle={items.length === 0 ? { flex: 1 } : {}}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { 
    flex: 1, 
    padding: 16, 
    backgroundColor: 'rgba(240, 255, 234, 1)' 
  },
  title: { 
    fontSize: 28, 
    fontWeight: '700', 
    marginBottom: 8, 
    textAlign: 'center',
    color: '#2d3748'
  },
  desc: { 
    fontSize: 16, 
    fontWeight: '300', 
    marginBottom: 20, 
    textAlign: 'center',
    color: '#666'
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  formRow: { 
    flexDirection: 'row', 
    gap: 12, 
    alignItems: 'flex-end',
    marginBottom: 16
  },
  input: {
    flex: 1, 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    paddingHorizontal: 12, 
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
    textAlignVertical: 'top',
    fontSize: 16
  },
  moodRow: {
    marginBottom: 16,
  },
  moodLabel: { 
    fontSize: 16, 
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
    color: '#374151'
  },
  moodButtons: { 
    flexDirection: 'row', 
    gap: 8,
    justifyContent: 'center'
  },
  moodButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  moodButtonActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1976d2',
    transform: [{ scale: 1.1 }]
  },
  moodButtonText: {
    fontSize: 24,
  },
  moodNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 2
  },
  switchWrap: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  switchLabel: { 
    fontSize: 14, 
    flex: 1,
    marginRight: 12,
    color: '#374151'
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  error: { 
    color: '#dc2626', 
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500'
  },
  entriesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  entriesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151'
  },
  entriesCount: {
    fontSize: 14,
    color: '#666'
  },
  row: { 
    paddingVertical: 14, 
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  rowText: { 
    fontSize: 16, 
    flex: 1,
    marginRight: 8,
    color: '#1f2937'
  },
  moodBadge: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  rowMeta: { 
    fontSize: 13, 
    color: '#6b7280', 
    marginTop: 2 
  },
  rowMetaSmall: { 
    fontSize: 12, 
    color: '#9ca3af',
    marginTop: 2
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 16
  },
  emptyContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    paddingVertical: 60
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16
  },
  empty: { 
    color: '#374151', 
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8
  },
  emptySubtext: {
    color: '#6b7280',
    textAlign: 'center',
    fontSize: 14
  },
  list: {
    flex: 1
  }
});