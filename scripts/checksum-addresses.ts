import { ethers } from 'ethers';

const addresses = [
  '0x5ed43D586FC3cceFb1951fca46e21019253caD98',
  '0xa2CA7089C879e5536bAb8F8d9F1F47c3eBa0F960',
  '0x9B860b12FC7b02c6B7e478e3f20bC0BAA79E3b91',
  '0x41224d2e20a43d5F58C7F1f6Dc2C99CEC8Df8680',
];

console.log('Checksummed addresses:');
addresses.forEach(addr => {
  try {
    const checksummed = ethers.getAddress(addr.toLowerCase());
    console.log(`${addr} -> ${checksummed}`);
  } catch (e: any) {
    console.log(`${addr} -> ERROR: ${e.message}`);
  }
});
