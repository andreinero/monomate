import { Alert, type AlertButton } from 'react-native';

/**
 * On desktop, React Native's Alert does nothing. Every alert in the app is either a notice or
 * "Cancel / do it", which map onto the browser's own alert() and confirm().
 */
Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
  const text = [title, message].filter(Boolean).join('\n\n');
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  const cancel = (buttons ?? []).find((b) => b.style === 'cancel');
  if (!actions.length) {
    window.alert(text);
    cancel?.onPress?.();
    return;
  }
  if (window.confirm(`${text}\n\nOK = ${actions[0].text}`)) actions[0].onPress?.();
  else cancel?.onPress?.();
};
