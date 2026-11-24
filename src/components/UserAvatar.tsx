import { useMemo } from 'react';
import { Image, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { avatarSvg, type AvatarConfig } from '../lib/avatar';
import { photoUri } from '../lib/photo';
import { B, C, F } from '../lib/theme';

/** The player's drawn avatar, framed like the coach and bot portraits. */
export function UserAvatar({ config, size = 56 }: { config: AvatarConfig; size?: number }) {
  const xml = useMemo(() => avatarSvg(config), [config]);
  const inner = size - 2 * B.w;
  return (
    <View style={{ width: size, height: size, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.paper, overflow: 'hidden' }}>
      <SvgXml xml={xml} width={inner} height={inner} />
    </View>
  );
}

export type MyPicture = { photo?: string; avatar?: AvatarConfig };

/** Your profile picture: your photo, else your drawn avatar, else a black letter tile. */
export function ProfilePicture({ me, size = 56, letter = 'Y' }: { me: MyPicture; size?: number; letter?: string }) {
  if (me.photo) {
    return (
      <View style={{ width: size, height: size, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.paper, overflow: 'hidden' }}>
        <Image source={{ uri: photoUri(me.photo) }} style={{ width: size - 2 * B.w, height: size - 2 * B.w }} resizeMode="cover" />
      </View>
    );
  }
  if (me.avatar) return <UserAvatar config={me.avatar} size={size} />;
  return (
    <View style={{ width: size, height: size, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.white, fontFamily: F.monoBold, fontSize: size * 0.48 }}>{letter}</Text>
    </View>
  );
}
