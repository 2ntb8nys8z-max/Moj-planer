// The journal's source summary is still available from the owner's private sheet.
exports.openSourceShopping=async page=>{
  await page.locator('#phoneShopping').click();
  const paper=page.frameLocator('#ownerPaperDialog iframe');
  await paper.getByRole('button',{name:'Więcej opcji listy'}).click();
  await paper.getByRole('button',{name:'Zestawienie list źródłowych'}).click();
};
