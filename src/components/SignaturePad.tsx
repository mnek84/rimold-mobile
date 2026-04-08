import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import SignatureCanvas, { type SignatureViewRef } from 'react-native-signature-canvas';

import { borderSubtle, useTheme, type AppTheme } from '@theme';

export type SignaturePadHandle = {
  clear: () => void;
  /** Triggers {@link onSignature} with a PNG data URL, or {@link onEmpty} if nothing was drawn. */
  readSignature: () => void;
};

type Props = {
  /** PNG data URL (`data:image/png;base64,...`) */
  onSignature: (dataUrl: string) => void;
  onEmpty?: () => void;
};

function webStyle(border: string, radius: number) {
  return `
  .m-signature-pad { box-shadow: none; border: none; margin: 0; }
  .m-signature-pad--body { border: 1px solid ${border}; border-radius: ${radius}px; }
  .m-signature-pad--footer { display: none; }
  body, html { margin: 0; padding: 0; }
`;
}

/**
 * WebView-backed signature capture (JPEG/PNG export via {@link readSignature}).
 */
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { onSignature, onEmpty },
  ref,
) {
  const theme = useTheme();
  const styles = useMemo(() => createPadStyles(theme), [theme]);
  const webStyleStr = useMemo(
    () => webStyle(borderSubtle, theme.spacing.radiusMd),
    [theme.spacing.radiusMd],
  );
  const canvasRef = useRef<SignatureViewRef>(null);

  useImperativeHandle(ref, () => ({
    clear: () => {
      canvasRef.current?.clearSignature();
    },
    readSignature: () => {
      canvasRef.current?.readSignature();
    },
  }));

  return (
    <View style={styles.wrap} collapsable={false}>
      <SignatureCanvas
        ref={canvasRef}
        onOK={onSignature}
        onEmpty={onEmpty}
        penColor={theme.colors.background}
        backgroundColor={theme.colors.text}
        imageType="image/png"
        webStyle={webStyleStr}
        nestedScrollEnabled
        style={styles.canvas}
      />
    </View>
  );
});

function createPadStyles(t: AppTheme) {
  const { colors, spacing } = t;
  return StyleSheet.create({
    wrap: {
      height: 200,
      borderRadius: spacing.radiusMd,
      overflow: 'hidden',
      backgroundColor: colors.text,
    },
    canvas: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
  });
}
