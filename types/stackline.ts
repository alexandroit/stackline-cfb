import * as CFB from 'cfb';

const container: CFB.CFB$Container = CFB.utils.cfb_new();
CFB.utils.cfb_add(container, 'a.txt', [1, 2, 3]);
const withoutSeed: any = CFB.write(container, { type: 'buffer', noseed: true });
const zip: any = CFB.write(container, { type: 'buffer', fileType: 'zip', compression: true });
const end: number = CFB.utils.consts.ENDOFCHAIN;
const entryTypes: string[] = CFB.utils.consts.EntryTypes;
const raw: any = CFB.utils._deflateRaw([1, 2, 3]);
const back: any = CFB.utils._inflateRaw(raw);
CFB.utils.use_zlib({});
void [withoutSeed, zip, end, entryTypes, back];
