import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Button, type ButtonSize, type ButtonVariant } from '@components/ui';
import { showToast } from '@core/feedback/toastStore';
import { useTheme } from '@theme';

import { canOpenFlexApp, openMercadoFlexApp } from '../flexApp';
import { flexOutcomeMessage } from '../flexAppLauncher';

type Props = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

/**
 * La acción contextual de un envío Flex: "Abrir Mercado Libre Flex".
 *
 * Es la contraparte de "Entregado" en un envío propio. La confirmación de un
 * Flex ocurre en la app de Mercado Libre; esta app sólo la abre y después
 * muestra el estado que Mercado Libre informe por webhook. Un solo componente
 * para la lista, el mapa y el detalle, así el texto y el fallback no divergen.
 */
export function OpenFlexAppButton({ variant = 'primary', size = 'md', fullWidth = true }: Props) {
  const theme = useTheme();
  const [opening, setOpening] = useState(false);

  const onPress = useCallback(async () => {
    setOpening(true);
    try {
      const message = flexOutcomeMessage(await openMercadoFlexApp());
      if (message !== null) {
        showToast(message);
      }
    } finally {
      setOpening(false);
    }
  }, []);

  if (!canOpenFlexApp()) {
    return (
      <Text style={[theme.typography.caption, { color: theme.colors.muted }]}>
        Abrí Mercado Libre Flex desde la pantalla de inicio para confirmar esta entrega: en este
        teléfono no hay un acceso directo verificado.
      </Text>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      icon="open-outline"
      fullWidth={fullWidth}
      accessibilityRole="link"
      accessibilityLabel="Abrir Mercado Libre Flex"
      accessibilityHint="Abre la app de Mercado Libre Flex, donde se confirma esta entrega"
      accessibilityState={{ busy: opening }}
      disabled={opening}
      onPress={() => void onPress()}
    >
      {opening ? 'Abriendo…' : 'Abrir Mercado Libre Flex'}
    </Button>
  );
}
