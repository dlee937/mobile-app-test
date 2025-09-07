import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type FoodEntry = {
  id: string;
  food_name: string;
  calories: number | null;
  protein: number | null;  // Add this
  carbs: number | null;    // Add this
  fat: number | null;      // Add this
  fiber: number | null;    // Add this
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  rating: number | null;
  notes: string | null;
  created_at: string | null;
  user_id: string;
};

type NutritionInfo = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const FOOD_TABLE = 'food_entries';

const searchFoodAPI = async (query: string): Promise<NutritionInfo[]> => {
  const API_KEY = process.env.EXPO_PUBLIC_FOOD_API_KEY;
  
  if (!API_KEY) {
    Alert.alert('Error', 'Food API key not configured');
    return [];
  }

  try {
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&api_key=${API_KEY}&pageSize=10`
    );
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    
    return data.foods?.map((food: any) => {
      const nutrients = food.foodNutrients || [];
      return {
        name: food.description || 'Unknown Food',
        calories: Math.round(nutrients.find((n: any) => n.nutrientId === 1008)?.value || 0),
        protein: Math.round(nutrients.find((n: any) => n.nutrientId === 1003)?.value || 0),
        carbs: Math.round(nutrients.find((n: any) => n.nutrientId === 1005)?.value || 0),
        fat: Math.round(nutrients.find((n: any) => n.nutrientId === 1004)?.value || 0),
      };
    }) || [];
  } catch (error) {
    console.error('Food API Error:', error);
    Alert.alert('Error', 'Failed to search food database');
    return [];
  }
};

export default function FoodScreen() {
  const [foodName, setFoodName] = useState<string>('');
  const [calories, setCalories] = useState<string>('');
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [rating, setRating] = useState<string>('3');
  const [notes, setNotes] = useState<string>('');
  const [selectedNutrition, setSelectedNutrition] = useState<NutritionInfo | null>(null);
  
  const [items, setItems] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const clearAllEntries = () => {
  Alert.alert(
    'Clear All Entries',
    'Are you sure you want to delete all your food entries? This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete All', 
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from(FOOD_TABLE)
            .delete()
            .eq('user_id', userId);
          
          if (error) {
            Alert.alert('Error', error.message);
          } else {
            Alert.alert('Success', 'All entries cleared');
            await fetchItems();
          }
        }
      }
    ]
  );
};
  
  // Feature 2: Nutrition lookup modal
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [nutritionResults, setNutritionResults] = useState<NutritionInfo[]>([]);
  
  // Feature 3: Daily summary
  const [showSummary, setShowSummary] = useState(false);
  const [dailySummary, setDailySummary] = useState<{
    totalCalories: number;
    totalProtein: number;     // Add this
    totalCarbs: number;       // Add this
    totalFat: number;         // Add this
    totalFiber: number;       // Add this
    mealCounts: { breakfast: number; lunch: number; dinner: number; snack: number };
    averageRating: number;
  } | null>(null);

  // Security fix: Sanitize input to prevent XSS
  const sanitizeInput = (input: string): string => {
    return input.replace(/[<>&"']/g, '').trim();
  };

  // Handle food name changes with sanitization
  const handleFoodNameChange = (text: string) => {
    const sanitized = sanitizeInput(text);
    setFoodName(sanitized);
  };

  // Handle notes changes with sanitization
  const handleNotesChange = (text: string) => {
    const sanitized = sanitizeInput(text);
    setNotes(sanitized);
  };

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
      .from(FOOD_TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<FoodEntry[]>();

    if (qErr) setError(qErr.message);
    setItems(data ?? []);
    
    // Calculate daily summary
    if (data) {
      calculateDailySummary(data);
    }
    
    setRefreshing(false);
  }, [userId]);

  const calculateDailySummary = (entries: FoodEntry[]) => {
    const today = new Date().toDateString();
    const todayEntries = entries.filter(e => 
      e.created_at && new Date(e.created_at).toDateString() === today
    );

    const totalCalories = todayEntries.reduce((sum, entry) => sum + (entry.calories || 0), 0);
    const totalProtein = todayEntries.reduce((sum, entry) => sum + (entry.protein || 0), 0);
    const totalCarbs = todayEntries.reduce((sum, entry) => sum + (entry.carbs || 0), 0);
    const totalFat = todayEntries.reduce((sum, entry) => sum + (entry.fat || 0), 0);
    const totalFiber = todayEntries.reduce((sum, entry) => sum + (entry.fiber || 0), 0);
    
    const mealCounts = {
      breakfast: todayEntries.filter(e => e.meal_type === 'breakfast').length,
      lunch: todayEntries.filter(e => e.meal_type === 'lunch').length,
      dinner: todayEntries.filter(e => e.meal_type === 'dinner').length,
      snack: todayEntries.filter(e => e.meal_type === 'snack').length,
    };
    
    const ratingsSum = todayEntries.reduce((sum, entry) => sum + (entry.rating || 0), 0);
    const averageRating = todayEntries.length > 0 ? ratingsSum / todayEntries.length : 0;

    setDailySummary({ 
      totalCalories, 
      totalProtein, 
      totalCarbs, 
      totalFat, 
      totalFiber, 
      mealCounts, 
      averageRating 
    });
  };

  useEffect(() => {
    if (userId) {
      (async () => {
        setLoading(true);
        await fetchItems();
        setLoading(false);
      })();
    }
  }, [fetchItems, userId]);

  // Feature 1: Food logging with meal type and rating
  const addFoodEntry = async () => {
    if (!userId) {
      setError('User not authenticated');
      return;
    }

    const trimmedName = foodName.trim();
    if (!trimmedName) {
      Alert.alert('Error', 'Please enter a food name');
      return;
    }

    if (trimmedName.length > 100) {
      Alert.alert('Error', 'Food name too long (max 100 characters)');
      return;
    }

    if (notes.length > 500) {
      Alert.alert('Error', 'Notes too long (max 500 characters)');
      return;
    }

    setInserting(true);
    setError(null);

    const caloriesNumber = parseInt(calories, 10) || 0;
    const ratingNumber = Math.min(5, Math.max(1, parseInt(rating, 10) || 3));

    if (caloriesNumber < 0 || caloriesNumber > 10000) {
      Alert.alert('Error', 'Please enter a valid calorie amount (0-10000)');
      setInserting(false);
      return;
    }

  const { error: insErr } = await supabase
  .from(FOOD_TABLE)
  .insert({ 
    food_name: trimmedName,
    calories: caloriesNumber,
    protein: selectedNutrition?.protein || null,
    carbs: selectedNutrition?.carbs || null,
    fat: selectedNutrition?.fat || null,
    fiber: selectedNutrition?.fat || null, // API doesn't have fiber, using fat as placeholder
    meal_type: mealType,
    rating: ratingNumber,
    notes: notes.trim() || null,
    user_id: userId
  });

    if (insErr) {
      setError(insErr.message);
    } else {
      Alert.alert(
        "Food Logged!",
        `${trimmedName} (${caloriesNumber} cal) added to ${mealType}`
      );
      setFoodName('');
      setCalories('');
      setNotes('');
      setSelectedNutrition(null);
    }
    
    await fetchItems();
    setInserting(false);
  };

  // Feature 2: Nutrition lookup
// Feature 2: Nutrition lookup - REPLACE THE EXISTING FUNCTION
  const searchNutrition = async () => {
    const query = foodName.toLowerCase().trim();
    if (!query) {
      Alert.alert('Search', 'Enter a food name to search nutrition info');
      return;
    }

    setNutritionResults([]);
    const results = await searchFoodAPI(query);
    setNutritionResults(results);
    setShowNutritionModal(true);
  };

  const selectNutritionItem = (nutrition: NutritionInfo) => {
    setFoodName(nutrition.name);
    setCalories(nutrition.calories.toString());
    setSelectedNutrition(nutrition); // Store the full nutrition data
    setShowNutritionModal(false);
    Alert.alert(
      'Nutrition Info Applied!',
      `${nutrition.name}: ${nutrition.calories} cal, ${nutrition.protein}g protein, ${nutrition.carbs}g carbs, ${nutrition.fat}g fat`
    );
  };

  const renderFoodItem = ({ item }: { item: FoodEntry }) => {
    const when = item.created_at ? new Date(item.created_at).toLocaleString() : '';
    const mealEmoji = {
      breakfast: '🌅',
      lunch: '☀️',
      dinner: '🌙',
      snack: '🍿'
    }[item.meal_type];
    
    const ratingStars = '⭐'.repeat(item.rating || 0);

    const onPressRow = () => {
      const safeNotes = item.notes ? sanitizeInput(item.notes) : '';
      const macroInfo = (item.protein || item.carbs || item.fat) ? 
        `\nProtein: ${item.protein || 0}g, Carbs: ${item.carbs || 0}g, Fat: ${item.fat || 0}g` : '';
      
      Alert.alert(
        `${mealEmoji} ${item.food_name}`,
        `${when}\n\nMeal: ${item.meal_type}\nCalories: ${item.calories || 'Not specified'}${macroInfo}\nRating: ${ratingStars} (${item.rating}/5)${safeNotes ? `\n\nNotes: ${safeNotes}` : ''}`,
        [{ text: 'OK' }]
      );
    };

    return (
      <Pressable onPress={onPressRow} style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#f0f0f0' }]}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowText}>{mealEmoji} {item.food_name}</Text>
          <Text style={styles.caloriesBadge}>{item.calories || 0} cal</Text>
        </View>
        <Text style={styles.rowMeta}>{when} • {item.meal_type}</Text>
        <Text style={styles.rowMeta}>{ratingStars} ({item.rating}/5)</Text>
        {item.notes && <Text style={styles.notesText}>📝 {sanitizeInput(item.notes)}</Text>}
      </Pressable>
    );
  };

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
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView 
          style={styles.container}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <Text style={styles.title}>Food Tracker</Text>
            <Text style={styles.desc}>Log your meals, search nutrition, and track daily intake!</Text>

            {/* Feature Buttons */}
            <View style={styles.featureButtons}>
              <TouchableOpacity style={styles.featureButton} onPress={searchNutrition}>
                <Text style={styles.featureButtonText}>🔍 Search Nutrition</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.featureButton} onPress={() => setShowSummary(true)}>
                <Text style={styles.featureButtonText}>📊 Daily Summary</Text>
              </TouchableOpacity>
            </View>

            {/* Add this new section right after the feature buttons */}
            <View style={styles.clearButtonContainer}>
              <TouchableOpacity style={styles.clearButton} onPress={clearAllEntries}>
                <Text style={styles.clearButtonText}>Clear All Entries</Text>
              </TouchableOpacity>
            </View>
            

            {/* Food Entry Form */}
            <View style={styles.formContainer}>
              <View style={styles.formRow}>
                <TextInput
                  value={foodName}
                  onChangeText={handleFoodNameChange}
                  placeholder="Food name (e.g., Apple, Chicken breast)"
                  placeholderTextColor="#727272ff"
                  style={styles.input}
                  editable={!inserting}
                  maxLength={100}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  blurOnSubmit={true}
                />
                <TextInput
                  value={calories}
                  onChangeText={setCalories}
                  placeholder="Calories"
                  placeholderTextColor="#727272ff"
                  keyboardType="number-pad"
                  style={styles.inputSmall}
                  editable={!inserting}
                  maxLength={5}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  blurOnSubmit={true}
                />
              </View>
              
              {/* Meal Type Selection */}
              <View style={styles.mealTypeRow}>
                <Text style={styles.mealLabel}>Meal Type:</Text>
                <View style={styles.mealButtons}>
                  {[
                    { key: 'breakfast', emoji: '🌅', label: 'Breakfast' },
                    { key: 'lunch', emoji: '☀️', label: 'Lunch' },
                    { key: 'dinner', emoji: '🌙', label: 'Dinner' },
                    { key: 'snack', emoji: '🍿', label: 'Snack' }
                  ].map(meal => (
                    <TouchableOpacity
                      key={meal.key}
                      style={[
                        styles.mealButton,
                        mealType === meal.key && styles.mealButtonActive
                      ]}
                      onPress={() => setMealType(meal.key as any)}
                      disabled={inserting}
                    >
                      <Text style={styles.mealEmoji}>{meal.emoji}</Text>
                      <Text style={[
                        styles.mealButtonText,
                        mealType === meal.key && styles.mealButtonTextActive
                      ]}>
                        {meal.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Rating */}
              <View style={styles.ratingRow}>
                <Text style={styles.ratingLabel}>How was it? (1-5 stars):</Text>
                <View style={styles.ratingButtons}>
                  {[1, 2, 3, 4, 5].map(num => (
                    <TouchableOpacity
                      key={num}
                      style={[
                        styles.ratingButton,
                        parseInt(rating) === num && styles.ratingButtonActive
                      ]}
                      onPress={() => setRating(num.toString())}
                      disabled={inserting}
                    >
                      <Text style={styles.ratingButtonText}>⭐</Text>
                      <Text style={styles.ratingNumber}>{num}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Notes */}
              <TextInput
                value={notes}
                onChangeText={handleNotesChange}
                placeholder="Notes (optional - how did it taste, where did you eat, etc.)"
                placeholderTextColor="#727272ff"
                style={styles.notesInput}
                editable={!inserting}
                multiline
                numberOfLines={2}
                maxLength={500}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <Button
                title={inserting ? 'Logging Food...' : 'Log Food Entry'}
                onPress={addFoodEntry}
                disabled={inserting || !foodName.trim()}
                color="#0066cc"
              />
            </View>

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.error}>⚠️ {error}</Text>
              </View>
            )}

            <View style={styles.entriesHeader}>
              <Text style={styles.entriesTitle}>Recent Food Entries</Text>
              <Text style={styles.entriesCount}>({items.length} total)</Text>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0066cc" />
                <Text style={styles.loadingText}>Loading food entries...</Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(it) => it.id}
                renderItem={renderFoodItem}
                refreshControl={
                  <RefreshControl 
                    refreshing={refreshing} 
                    onRefresh={fetchItems}
                    tintColor="#0066cc"
                  />
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyEmoji}>🍽️</Text>
                    <Text style={styles.empty}>No food entries yet!</Text>
                    <Text style={styles.emptySubtext}>Log your first meal above</Text>
                  </View>
                }
                style={styles.list}
                contentContainerStyle={items.length === 0 ? { flex: 1 } : {}}
              />
            )}

            {/* Nutrition Lookup Modal */}
            <Modal visible={showNutritionModal} transparent animationType="slide">
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Nutrition Search Results</Text>
                  
                  {nutritionResults.length > 0 ? (
                    <FlatList
                      data={nutritionResults}
                      keyExtractor={(item) => item.name}
                      renderItem={({ item }) => (
                        <TouchableOpacity 
                          style={styles.nutritionItem}
                          onPress={() => selectNutritionItem(item)}
                        >
                          <Text style={styles.nutritionName}>{item.name}</Text>
                          <Text style={styles.nutritionDetails}>
                            {item.calories} cal • {item.protein}g protein • {item.carbs}g carbs • {item.fat}g fat
                          </Text>
                        </TouchableOpacity>
                      )}
                      style={styles.nutritionList}
                    />
                  ) : (
                    <Text style={styles.noResults}>
                      No nutrition data found. Try searching for common foods like apple or chicken.
                    </Text>
                  )}
                  
                  <TouchableOpacity style={styles.closeButton} onPress={() => setShowNutritionModal(false)}>
                    <Text style={styles.closeButtonText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            {/* Daily Summary Modal */}
            <Modal visible={showSummary} transparent animationType="slide">
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Food Summary for Today</Text>
                  
                  {dailySummary ? (
                    <ScrollView style={styles.summaryScroll}>
                      <View style={styles.summarySection}>
                        <Text style={styles.summaryLabel}>Total Calories</Text>
                        <Text style={styles.summaryValue}>{dailySummary.totalCalories} cal</Text>
                      </View>
                      
                      <View style={styles.summarySection}>
                        <Text style={styles.summaryLabel}>Meals Today</Text>
                        <View style={styles.mealCounts}>
                          <Text style={styles.mealCount}>🌅 Breakfast: {dailySummary.mealCounts.breakfast}</Text>
                          <Text style={styles.mealCount}>☀️ Lunch: {dailySummary.mealCounts.lunch}</Text>
                          <Text style={styles.mealCount}>🌙 Dinner: {dailySummary.mealCounts.dinner}</Text>
                          <Text style={styles.mealCount}>🍿 Snacks: {dailySummary.mealCounts.snack}</Text>
                        </View>
                      </View>
                      <View style={styles.summarySection}>
                        <Text style={styles.summaryLabel}>Macronutrients</Text>
                        <Text style={styles.summaryValue}>Protein: {dailySummary.totalProtein.toFixed(1)}g</Text>
                        <Text style={styles.summaryValue}>Carbs: {dailySummary.totalCarbs.toFixed(1)}g</Text>
                        <Text style={styles.summaryValue}>Fat: {dailySummary.totalFat.toFixed(1)}g</Text>
                        <Text style={styles.summaryValue}>Fiber: {dailySummary.totalFiber.toFixed(1)}g</Text>
                      </View>
                      
                      <View style={styles.summarySection}>
                        <Text style={styles.summaryLabel}>Average Rating</Text>
                        <Text style={styles.summaryValue}>
                          {'⭐'.repeat(Math.round(dailySummary.averageRating))} ({dailySummary.averageRating.toFixed(1)}/5)
                        </Text>
                      </View>
                    </ScrollView>
                  ) : (
                    <Text style={styles.noData}>No food entries for today</Text>
                  )}
                  
                  <TouchableOpacity style={styles.closeButton} onPress={() => setShowSummary(false)}>
                    <Text style={styles.closeButtonText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  </SafeAreaView>
);
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { 
    flex: 1, 
    padding: 16, 
    backgroundColor: '#fff8dc'
  },
  title: { 
    fontSize: 28, 
    fontWeight: '700', 
    marginBottom: 8, 
    textAlign: 'center',
    color: '#8b4513'
  },
    clearButtonContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  clearButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 6,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  desc: { 
    fontSize: 16, 
    fontWeight: '300', 
    marginBottom: 16, 
    textAlign: 'center',
    color: '#666'
  },
  featureButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  featureButton: {
    flex: 1,
    backgroundColor: '#ffa500',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  featureButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
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
    gap: 8, 
    marginBottom: 12
  },
  input: {
    flex: 1, 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    paddingHorizontal: 12, 
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
    fontSize: 16
  },
  inputSmall: {
    width: 80,
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    paddingHorizontal: 12, 
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
    fontSize: 16,
    textAlign: 'center'
  },
  mealTypeRow: {
    marginBottom: 12,
  },
  mealLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151'
  },
  mealButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  mealButton: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mealButtonActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1976d2',
  },
  mealEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  mealButtonText: {
    fontSize: 12,
    color: '#666',
  },
  mealButtonTextActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
  ratingRow: {
    marginBottom: 12,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#374151'
  },
  ratingButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  ratingButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  ratingButtonActive: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffa500',
  },
  ratingButtonText: {
    fontSize: 16,
  },
  ratingNumber: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
  notesInput: {
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    paddingHorizontal: 12, 
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 16,
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
  caloriesBadge: {
    backgroundColor: '#fef3c7',
    color: '#d97706',
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
  notesText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 4,
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
    color: '#374151',
  },
  nutritionList: {
    maxHeight: 300,
  },
  nutritionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  nutritionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  nutritionDetails: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  noResults: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    padding: 20,
  },
  summaryScroll: {
    maxHeight: 400,
  },
  summarySection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  summaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1976d2',
  },
  mealCounts: {
    gap: 4,
  },
  mealCount: {
    fontSize: 14,
    color: '#6b7280',
  },
  noData: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    padding: 20,
  },
  closeButton: {
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});