import { View } from 'react-native';
import { B, C, F } from '../lib/theme';

/** Page-coloured header with a heavy ink rule underneath. */
export const HeaderRule = () => <View style={{ flex: 1, backgroundColor: C.white, borderBottomWidth: B.w, borderColor: C.ink }} />;

/** Header title style for the current theme (call at render time). */
export const headerTitleStyle = () => ({ fontFamily: F.bold, fontSize: 17, color: C.ink });
