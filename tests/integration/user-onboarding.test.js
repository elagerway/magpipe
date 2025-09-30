import { describe, it, expect, beforeAll } from 'vitest';
import { User, Contact, AgentConfig } from '../../src/models/index.js';
import { supabase } from '../../src/lib/supabase.js';

describe('User Onboarding Integration Test', () => {
  let testUserId;
  let testEmail;
  const testPassword = 'SecurePassword123!';
  const testName = 'Integration Test User';

  beforeAll(() => {
    testEmail = `integration-onboarding-${Date.now()}@example.com`;
  });

  it('should complete full onboarding flow: signup -> verify -> phone -> service number -> agent config', async () => {
    // Step 1: User signs up
    const { user: signupUser, error: signupError } = await User.signUp(
      testEmail,
      testPassword,
      testName
    );

    expect(signupError).toBeNull();
    expect(signupUser).toBeDefined();
    expect(signupUser.email).toBe(testEmail);
    testUserId = signupUser.id;

    // Step 2: Create user profile (would be done via database trigger or separately)
    const { profile: createdProfile, error: profileError } = await User.createProfile(
      testUserId,
      testEmail,
      testName
    );

    expect(profileError).toBeNull();
    expect(createdProfile).toBeDefined();
    expect(createdProfile.email).toBe(testEmail);
    expect(createdProfile.name).toBe(testName);

    // Step 3: User verifies phone number
    const testPhoneNumber = `+1415555${Math.floor(1000 + Math.random() * 9000)}`;
    const { profile: verifiedProfile, error: verifyError } = await User.verifyPhone(
      testUserId,
      testPhoneNumber
    );

    expect(verifyError).toBeNull();
    expect(verifiedProfile.phone_number).toBe(testPhoneNumber);
    expect(verifiedProfile.phone_verified).toBe(true);

    // Step 4: User selects service number
    const testServiceNumber = `+1415555${Math.floor(1000 + Math.random() * 9000)}`;
    const { profile: serviceProfile, error: serviceError } = await User.setServiceNumber(
      testUserId,
      testServiceNumber
    );

    expect(serviceError).toBeNull();
    expect(serviceProfile.service_number).toBe(testServiceNumber);

    // Step 5: Create agent configuration
    const { config: agentConfig, error: configError } = await AgentConfig.create({
      user_id: testUserId,
      system_prompt: 'You are Pat, my personal AI assistant.',
      voice_id: 'kate',
      response_style: 'friendly',
    });

    expect(configError).toBeNull();
    expect(agentConfig).toBeDefined();
    expect(agentConfig.system_prompt).toBe('You are Pat, my personal AI assistant.');
    expect(agentConfig.voice_id).toBe('kate');

    // Step 6: Verify user can retrieve their complete profile
    const { profile: finalProfile, error: finalError } = await User.getProfile(testUserId);

    expect(finalError).toBeNull();
    expect(finalProfile.phone_verified).toBe(true);
    expect(finalProfile.phone_number).toBe(testPhoneNumber);
    expect(finalProfile.service_number).toBe(testServiceNumber);

    // Cleanup
    await supabase.from('agent_configs').delete().eq('user_id', testUserId);
    await supabase.from('users').delete().eq('id', testUserId);
  });

  it('should handle onboarding with contact import', async () => {
    // Sign up new user
    const email = `integration-contacts-${Date.now()}@example.com`;
    const { user, error: signupError } = await User.signUp(email, testPassword, 'Contact Test User');

    expect(signupError).toBeNull();
    const userId = user.id;

    // Create profile
    await User.createProfile(userId, email, 'Contact Test User');

    // Verify phone
    const phoneNumber = `+1415555${Math.floor(1000 + Math.random() * 9000)}`;
    await User.verifyPhone(userId, phoneNumber);

    // Import contacts
    const contacts = [
      { name: 'Alice Johnson', phone_number: '+14155551111', is_whitelisted: true },
      { name: 'Bob Smith', phone_number: '+14155552222', is_whitelisted: true },
      { name: 'Charlie Davis', phone_number: '+14155553333', is_whitelisted: false },
    ];

    const { contacts: importedContacts, error: importError } = await Contact.bulkImport(
      userId,
      contacts
    );

    expect(importError).toBeNull();
    expect(importedContacts).toHaveLength(3);
    expect(importedContacts[0].name).toBe('Alice Johnson');

    // Verify contacts are retrievable
    const { contacts: allContacts, error: listError } = await Contact.list(userId);

    expect(listError).toBeNull();
    expect(allContacts).toHaveLength(3);

    // Verify whitelist filter works
    const { contacts: whitelistedContacts, error: whitelistError } = await Contact.getWhitelisted(
      userId
    );

    expect(whitelistError).toBeNull();
    expect(whitelistedContacts).toHaveLength(2);

    // Cleanup
    await supabase.from('contacts').delete().in('id', importedContacts.map((c) => c.id));
    await supabase.from('users').delete().eq('id', userId);
  });

  it('should prevent duplicate email registration', async () => {
    const duplicateEmail = `integration-duplicate-${Date.now()}@example.com`;

    // First registration
    const { user: firstUser, error: firstError } = await User.signUp(
      duplicateEmail,
      testPassword,
      'First User'
    );

    expect(firstError).toBeNull();
    expect(firstUser).toBeDefined();

    // Attempt duplicate registration
    const { user: secondUser, error: secondError } = await User.signUp(
      duplicateEmail,
      testPassword,
      'Second User'
    );

    // Supabase will reject duplicate email
    expect(secondError).toBeDefined();
    expect(secondUser).toBeNull();

    // Cleanup
    await supabase.from('users').delete().eq('id', firstUser.id);
  });

  it('should allow user to update agent configuration after onboarding', async () => {
    const email = `integration-config-${Date.now()}@example.com`;
    const { user } = await User.signUp(email, testPassword, 'Config Test User');
    const userId = user.id;

    await User.createProfile(userId, email, 'Config Test User');

    // Create initial config
    const { config: initialConfig } = await AgentConfig.create({
      user_id: userId,
      system_prompt: 'Initial prompt',
      voice_id: 'kate',
    });

    expect(initialConfig.system_prompt).toBe('Initial prompt');

    // Update config
    const { config: updatedConfig, error: updateError } = await AgentConfig.update(userId, {
      system_prompt: 'Updated prompt',
      voice_id: 'nova',
      response_style: 'casual',
    });

    expect(updateError).toBeNull();
    expect(updatedConfig.system_prompt).toBe('Updated prompt');
    expect(updatedConfig.voice_id).toBe('nova');
    expect(updatedConfig.response_style).toBe('casual');

    // Cleanup
    await supabase.from('agent_configs').delete().eq('user_id', userId);
    await supabase.from('users').delete().eq('id', userId);
  });
});