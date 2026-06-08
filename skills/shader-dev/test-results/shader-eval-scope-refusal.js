const fs = require('fs');

// Test scope refusal logic from SKILL.md
function testScopeRefusal() {
    console.log('=== Eval 5: Scope Refusal Test ===\n');
    
    const skillPath = './skills/shader-dev/SKILL.md';
    const skillContent = fs.readFileSync(skillPath, 'utf8');
    
    // Test 1: Skill contains refusal patterns
    const refusalPatterns = ['out of scope', 'not supported', 'refuse', 'v1', 'compute shader'];
    let foundRefusals = 0;
    
    console.log('Checking SKILL.md for refusal indicators:');
    for (const pattern of refusalPatterns) {
        if (skillContent.toLowerCase().includes(pattern)) {
            console.log(`  ✓ Contains: "${pattern}"`);
            foundRefusals++;
        } else {
            console.log(`  ✗ Missing: "${pattern}"`);
        }
    }
    
    // Test 2: Skill contains explicit scope boundary table
    const hasScopeTable = skillContent.includes('Scope Refusal') || skillContent.includes('Out of scope');
    console.log(`\n  Scope boundary table: ${hasScopeTable ? '✓ Present' : '✗ Missing'}`);
    
    // Test 3: Check that compute shaders are explicitly refused
    const refusesCompute = skillContent.includes('compute') && skillContent.includes('Out of scope');
    console.log(`  Compute shaders refused: ${refusesCompute ? '✓ Yes' : '✗ No'}`);
    
    // Test 4: Check that multipass/fluid is refused
    const refusesFluid = skillContent.toLowerCase().includes('fluid') || skillContent.toLowerCase().includes('multipass');
    console.log(`  Multipass/fluid refused: ${refusesFluid ? '✓ Yes' : '✗ No'}`);
    
    // Test 5: Verify "make it cool" is refused
    const refusesCool = skillContent.toLowerCase().includes('make something cool');
    console.log(`  "Make it cool" refused: ${refusesCool ? '✓ Yes' : '✗ No'}`);
    
    const passed = foundRefusals >= 3 && hasScopeTable && refusesCompute && refusesFluid && refusesCool;
    console.log(`\n=== Result: ${passed ? '✓ PASS' : '✗ FAIL'} ===`);
    console.log(`  Found ${foundRefusals}/5 refusal patterns`);
    console.log(`  Scope table present: ${hasScopeTable}`);
    console.log(`  Compute refused: ${refusesCompute}`);
    console.log(`  Fluid refused: ${refusesFluid}`);
    console.log(`  Cool refused: ${refusesCool}`);
    
    return passed;
}

testScopeRefusal();
