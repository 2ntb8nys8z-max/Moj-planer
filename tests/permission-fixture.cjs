// Existing-feature regressions enter as a user who dismisses the initial setup.
// The first-run and grant/deny paths are exercised in device-permissions-browser.
exports.dismissInitialPermissions=async page=>{
 await page.evaluate(async()=>{await window.OktiPermissions?.afterLogin()});
 const dialog=page.locator('#oktiPermissionsDialog');
 if(await dialog.isVisible())await dialog.locator('#oktiFinishPermissions').click();
};
