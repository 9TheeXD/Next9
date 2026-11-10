import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface GameTutorialProps {
  title: string;
  description: string;
  iconName: keyof typeof Feather.glyphMap;
  iconColor: string;
  onStart: () => void;
}

export default function GameTutorial({ title, description, iconName, iconColor, onStart }: GameTutorialProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: `${iconColor}20` }]}>
        <Feather name={iconName} size={48} color={iconColor} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Pressable style={styles.button} onPress={onStart}>
        <Text style={styles.buttonText}>เริ่มเล่นเกม</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f0fdfa',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: "rgba(0,0,0,0.6)",
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#38bdf8',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
});
