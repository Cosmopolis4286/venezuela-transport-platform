import { API_BASE_PATH } from '@vtp/shared-types';
import { StyleSheet, Text, View } from 'react-native';
import { env } from '@/config/env';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>VTP · Transportistas</Text>
      <Text style={styles.body}>Conductores, empresas de transporte y operadores de terminal.</Text>
      <Text style={styles.meta}>Entorno de desarrollo listo. Aún sin funcionalidades.</Text>
      <Text style={styles.meta}>
        API: {env.apiBaseUrl} (contrato {API_BASE_PATH})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  title: { fontSize: 24, fontWeight: '600' },
  body: { fontSize: 16, textAlign: 'center' },
  meta: { fontSize: 12, opacity: 0.6, textAlign: 'center' },
});
