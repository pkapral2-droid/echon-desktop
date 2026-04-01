const path = require('path');

exports.default = async function(context) {
  // rcedit is Windows-only — skip on macOS/Linux
  if (process.platform !== 'win32') {
    console.log('Skipping afterPack (not Windows)');
    return;
  }

  const { rcedit } = require('rcedit');
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(__dirname, 'icon.ico');

  console.log(`Patching icon on: ${exePath}`);
  console.log(`Using icon: ${iconPath}`);

  await rcedit(exePath, { icon: iconPath });
  console.log('Icon patched successfully!');
};
