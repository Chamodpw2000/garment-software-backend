export function optimizeGarmentCutting(req, res) {
  console.log("Request body:", req.body);
    
  const { orders, maxBlocksPerCut, maxStackingCloth } = req.body;
     
  // Calculate total order quantity
  const totalOrderQuantity = Object.values(orders).reduce((sum, qty) => sum + qty, 0);

  // Convert orders to array of objects for easier processing
  const orderItems = Object.entries(orders).map(([size, quantity]) => ({
    size,
    quantity,
    remaining: quantity
  }));

  // Sort orders by quantity in descending order for better optimization
  orderItems.sort((a, b) => b.quantity - a.quantity);

  const cuttingPlan = [];
  let cutNumber = 0;

  // Continue until all orders are fulfilled
  while (orderItems.some(item => item.remaining > 0)) {
    cutNumber++;
    
    // Initialize the current cut
    const currentCut = {
      cutNumber,
      stackSize: 0,
      blocks: {}
    };
    
    // First pass: Determine optimal stack size
    // Start with the maximum allowed stack size
    let optimalStackSize = maxStackingCloth;
    
    // Find the minimum stack size that makes sense for the largest remaining order
    const largestRemainingOrder = orderItems.reduce(
      (max, item) => item.remaining > max ? item.remaining : max, 
      0
    );
    
    // If the largest order is smaller than max stacking, adjust stack size
    if (largestRemainingOrder < maxStackingCloth) {
      optimalStackSize = largestRemainingOrder;
    }
    
    // Set the initial stack size
    currentCut.stackSize = optimalStackSize;
    
    // Second pass: Allocate blocks optimally
    let remainingBlocks = maxBlocksPerCut;
    const sortedItems = [...orderItems].sort((a, b) => b.remaining - a.remaining);
    
    for (const item of sortedItems) {
      if (item.remaining > 0 && remainingBlocks > 0) {
        // Calculate how many complete blocks we need for this size
        // This explicitly considers using multiple blocks of the same size
        const neededBlocks = Math.ceil(item.remaining / currentCut.stackSize);
        
        // Allocate as many blocks as we can, up to what's needed
        const allocatedBlocks = Math.min(neededBlocks, remainingBlocks);
        
        if (allocatedBlocks > 0) {
          currentCut.blocks[item.size] = allocatedBlocks;
          remainingBlocks -= allocatedBlocks;
          
          // Calculate how many pieces we'll actually produce
          const producedQuantity = allocatedBlocks * currentCut.stackSize;
          
          // Update remaining quantity, ensuring we don't go negative
          item.remaining = Math.max(0, item.remaining - producedQuantity);
        }
      }
    }
    
    // Third pass: If we have remaining blocks and items, try to use partial blocks
    if (remainingBlocks > 0) {
      // Re-sort by remaining quantity
      const remainingItems = orderItems.filter(item => item.remaining > 0);
      remainingItems.sort((a, b) => b.remaining - a.remaining);
      
      for (const item of remainingItems) {
        if (remainingBlocks > 0 && item.remaining > 0) {
          // If we already allocated blocks for this size, increase the count
          if (currentCut.blocks[item.size]) {
            currentCut.blocks[item.size]++;
          } else {
            currentCut.blocks[item.size] = 1;
          }
          
          // Update remaining quantity and blocks
          item.remaining = Math.max(0, item.remaining - currentCut.stackSize);
          remainingBlocks--;
        }
      }
    }
    
    // Fourth pass: Optimize stack size to minimize waste
    // Only if we've allocated blocks
    if (Object.keys(currentCut.blocks).length > 0) {
      // Calculate the optimal stack size that minimizes waste
      let minWasteStackSize = currentCut.stackSize;
      let minWaste = Number.MAX_SAFE_INTEGER;
      
      // Try different stack sizes to find the one with minimum waste
      for (let testStackSize = 1; testStackSize <= currentCut.stackSize; testStackSize++) {
        let waste = 0;
        let canFulfillAllOrders = true;
        
        // Calculate waste for this stack size
        for (const [size, blocks] of Object.entries(currentCut.blocks)) {
          const originalOrder = orders[size];
          const alreadyProduced = originalOrder - orderItems.find(item => item.size === size).remaining - (blocks * testStackSize);
          
          // If we can't fulfill the order with this stack size, it's not valid
          if (alreadyProduced < 0) {
            canFulfillAllOrders = false;
            break;
          }
          
          // Calculate potential waste (overproduction)
          waste += Math.max(0, alreadyProduced);
        }
        
        // If this stack size can fulfill all orders and has less waste, use it
        if (canFulfillAllOrders && waste < minWaste) {
          minWaste = waste;
          minWasteStackSize = testStackSize;
        }
      }
      
      // Update the stack size to the optimal one
      currentCut.stackSize = minWasteStackSize;
      
      // Update the remaining quantities based on the new stack size
      for (const [size, blocks] of Object.entries(currentCut.blocks)) {
        const item = orderItems.find(i => i.size === size);
        const producedQuantity = blocks * currentCut.stackSize;
        
        // Find the original remaining before this cut
        const originalRemaining = item.remaining + producedQuantity;
        
        // Update to the new remaining based on optimized stack size
        item.remaining = Math.max(0, originalRemaining - (blocks * currentCut.stackSize));
      }
    }
    
    // If we couldn't allocate any blocks, handle edge case
    if (Object.keys(currentCut.blocks).length === 0) {
      // Find the item with the smallest remaining quantity
      const smallestItem = orderItems
        .filter(item => item.remaining > 0)
        .sort((a, b) => a.remaining - b.remaining)[0];
      
      if (smallestItem) {
        currentCut.blocks[smallestItem.size] = 1;
        currentCut.stackSize = smallestItem.remaining;
        smallestItem.remaining = 0;
      } else {
        // No items remaining, we're done
        break;
      }
    }
    
    cuttingPlan.push(currentCut);
  }

  // Generate summary
  const summary = Object.entries(orders).map(([size, quantity]) => {
    const sizeCuts = cuttingPlan
      .filter(cut => cut.blocks[size])
      .map(cut => ({
        cutNumber: cut.cutNumber,
        blocks: cut.blocks[size]
      }));
    
    return {
      size,
      quantity,
      cuts: sizeCuts
    };
  });

  // Calculate actual production quantities
  const production = {};
  for (const cut of cuttingPlan) {
    for (const [size, blocks] of Object.entries(cut.blocks)) {
      production[size] = (production[size] || 0) + (blocks * cut.stackSize);
    }
  }

  // Calculate waste (overproduction)
  let totalWaste = 0;
  for (const [size, quantity] of Object.entries(orders)) {
    const produced = production[size] || 0;
    totalWaste += Math.max(0, produced - quantity);
  }

  // Calculate utilization percentages
  const totalBlocksUsed = cuttingPlan.reduce((sum, cut) => 
    sum + Object.values(cut.blocks).reduce((s, b) => s + b, 0), 0);
  const totalBlockCapacity = cuttingPlan.length * maxBlocksPerCut;
  
  const totalStackUsed = cuttingPlan.reduce((sum, cut) => sum + cut.stackSize, 0);
  const totalStackCapacity = cuttingPlan.length * maxStackingCloth;
  
  const blockUtilizationPercent = Math.round((totalBlocksUsed / totalBlockCapacity) * 100);
  const stackUtilizationPercent = Math.round((totalStackUsed / totalStackCapacity) * 100);

  // Calculate cloth efficiency
  const totalClothUsed = cuttingPlan.reduce((sum, cut) => {
    return sum + (cut.stackSize * Object.values(cut.blocks).reduce((s, b) => s + b, 0));
  }, 0);
  
  const clothEfficiencyPercent = totalClothUsed > 0 
    ? Math.round(((totalClothUsed - totalWaste) / totalClothUsed) * 100)
    : 100;

  res.status(200).json({
    totalOrderQuantity,
    totalCuts: cuttingPlan.length,
    cuttingPlan,
    blockUtilizationPercent,
    stackUtilizationPercent,
    clothEfficiencyPercent,
    totalWaste,
    summary
  });
}
