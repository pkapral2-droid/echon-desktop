const path = require('path');
const { rcedit } = require('rcedit');

exports.default = async function(context) {
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(__dirname, 'icon.ico');

  console.log(`Patching icon on: ${exePath}`);
  console.log(`Using icon: ${iconPath}`);

  await rcedit(exePath, { icon: iconPath });
  console.log('Icon patched successfully!');
};
