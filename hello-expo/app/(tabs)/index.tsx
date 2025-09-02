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
} from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';

type Entry = {
  id: string;
  text: string;
  mood: number | null;
  created_at: string | null;
  lat: number | null;
  lng: number | null;
  weather: string | null;
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

  const fetchItems = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    const { data, error: qErr } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<Entry[]>();

    if (qErr) setError(qErr.message);
    setItems(data ?? []);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchItems();
      setLoading(false);
    })();
  }, [fetchItems]);

  const addItem = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setInserting(true);
    setError(null);

    let lat: number | null = null;
    let lng: number | null = null;
    let weather: string | null = null;

    if (useLocation) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        weather = await fetchWeather(lat, lng);
      }
    }

    const moodNumber = Math.min(5, Math.max(1, parseInt(mood, 10) || 3));

    const { error: insErr } = await supabase
      .from(TABLE)
      .insert({ text: trimmed, mood: moodNumber, lat, lng, weather });

    if (insErr) setError(insErr.message);
    setText('');
    await fetchItems();
    setInserting(false);
  };

  const renderItem = ({ item }: { item: Entry }) => {
    const when = item.created_at ? new Date(item.created_at).toLocaleString() : '';
    return (
      <View style={styles.row}>
        <Text style={styles.rowText}>{item.text}</Text>
        <Text style={styles.rowMeta}>
          {when}
        </Text>
        <Text style={styles.rowMeta}>
          {item.mood != null ? `Mood ${item.mood}` : ''}
        </Text>
        <Text style={styles.rowMeta}>
          {item.weather ? `Weather: ${item.weather}` : ''}
        </Text>
        {item.lat != null && item.lng != null ? (
          <Text style={styles.rowMetaSmall}>
           Latitude: {item.lat.toFixed(4)}, Longitude: {item.lng.toFixed(4)}
          </Text>
        ) : null}
      </View>
    );
  };

  const WEATHER_API_KEY = 'bfbe90ac8554b36605cc11902e437ef7';

  async function fetchWeather(lat: number, lng: number): Promise<string | null> {
    try {
      const resp = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${WEATHER_API_KEY}&units=metric`
      );
      const data = await resp.json();
      if (data.weather && data.weather.length > 0) {
        return data.weather[0].main;
      }
    } catch (err) {
      console.log('Weather fetch failed:', err);
    }
    return null;
  }
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Mood Journal</Text>
        <Text style={styles.desc}>Instructions: Input your status, mood, and location to save here! Reread your past entries in the homescreen.</Text>
        <View style={styles.formRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Describe your status here..."
            placeholderTextColor="#727272ff"
            style={styles.input}
            editable={!inserting}
          />
          <Button
            title={inserting ? 'Adding…' : 'Add'}
            onPress={addItem}
            disabled={inserting || !text.trim()}
            color="#0066cc"
          />
        </View>
        <View style={styles.formRow}>
          <TextInput
            value={mood}
            onChangeText={setMood}
            placeholder="Mood (1–5)"
            placeholderTextColor="#727272ff"
            keyboardType="number-pad"
            maxLength={1}
            style={styles.inputHalf}
            editable={!inserting}
          />
          
        </View>
        <View style={styles.switchWrap}>
            <Text style={styles.switchLabel}>Use Exact location</Text>
            <Switch value={useLocation} onValueChange={setUseLocation} disabled={inserting} />
          </View>

        {error ? <Text style={styles.error}>Error: {error}</Text> : null}

        {loading ? (
          <ActivityIndicator size="large" />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchItems} />}
            ListEmptyComponent={<Text style={styles.empty}>No entries yet. Add one above!</Text>}
            contentContainerStyle={items.length === 0 && styles.emptyContainer}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: 'rgba(240, 255, 234, 1)', alignItems: 'center'  },
  title: { fontSize: 26, fontWeight: '600', marginBottom: 8, marginTop: 8, textAlign: 'center' },
  desc: { fontSize: 14, fontWeight: '300', marginBottom: 4, marginTop: 4, textAlign: 'center' },
  formRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, height: 44,
  },
  inputHalf: {
    flex: 0.5, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, height: 44,
  },
  switchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchLabel: { fontSize: 14 },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd', minWidth: '100%'},
  rowText: { fontSize: 16 },
  rowMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  rowMetaSmall: { fontSize: 11, color: '#777' },
  error: { color: '#c00' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: '#666' },
});
