#!/bin/bash
# Release script for Twilite
# Bumps version in tauri.conf.json, commits, tags, and creates GitHub release
#
# Usage:
#   ./scripts/release.sh           # Bump patch version (0.5.14 -> 0.5.15)
#   ./scripts/release.sh minor     # Bump minor version (0.5.14 -> 0.6.0)
#   ./scripts/release.sh major     # Bump major version (0.5.14 -> 1.0.0)
#   ./scripts/release.sh 1.2.3     # Set specific version

set -e

cd "$(dirname "$0")/.."

TAURI_CONF="gui/src-tauri/tauri.conf.json"

# Check for uncommitted changes (excluding tauri.conf.json which we'll modify)
if ! /usr/bin/git diff --quiet --exit-code -- . ":(exclude)$TAURI_CONF"; then
    echo "Error: You have uncommitted changes. Please commit or stash them first."
    /usr/bin/git status --short
    exit 1
fi

# Get current version from tauri.conf.json
CURRENT_VERSION=$(grep '"version"' "$TAURI_CONF" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
echo "Current version: $CURRENT_VERSION"

# Parse current version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Determine new version
if [ -z "$1" ]; then
    # Default: bump patch
    NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
elif [ "$1" = "minor" ]; then
    NEW_VERSION="$MAJOR.$((MINOR + 1)).0"
elif [ "$1" = "major" ]; then
    NEW_VERSION="$((MAJOR + 1)).0.0"
elif [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    NEW_VERSION="$1"
else
    echo "Error: Invalid version argument: $1"
    echo "Usage: $0 [patch|minor|major|X.Y.Z]"
    exit 1
fi

echo "New version: $NEW_VERSION"

# Confirm
read -p "Continue with release v$NEW_VERSION? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Update tauri.conf.json
echo "Updating $TAURI_CONF..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$TAURI_CONF"
else
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$TAURI_CONF"
fi

# Verify the change
NEW_CHECK=$(grep '"version"' "$TAURI_CONF" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
if [ "$NEW_CHECK" != "$NEW_VERSION" ]; then
    echo "Error: Failed to update version in $TAURI_CONF"
    /usr/bin/git checkout "$TAURI_CONF"
    exit 1
fi

# Commit the version bump
echo "Committing version bump..."
/usr/bin/git add "$TAURI_CONF"
/usr/bin/git commit -m "chore: bump version to $NEW_VERSION"

# Push the commit
echo "Pushing to remote..."
/usr/bin/git push

# Create and push tag
TAG="v$NEW_VERSION"
echo "Creating tag $TAG..."
/usr/bin/git tag "$TAG"
/usr/bin/git push origin "$TAG"

# Generate release notes from commits since last tag
PREV_TAG=$(/usr/bin/git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
if [ -n "$PREV_TAG" ]; then
    echo "Generating release notes from $PREV_TAG to $TAG..."
    COMMITS=$(/usr/bin/git log --oneline "$PREV_TAG"..HEAD~1)  # Exclude the version bump commit
else
    echo "No previous tag found, using recent commits..."
    COMMITS=$(/usr/bin/git log --oneline -10 HEAD~1)
fi

# Categorize commits
FEATURES=""
FIXES=""
OTHER=""

while IFS= read -r line; do
    [ -z "$line" ] && continue
    if [[ "$line" =~ ^[a-f0-9]+\ feat ]]; then
        FEATURES="$FEATURES\n- ${line#* }"
    elif [[ "$line" =~ ^[a-f0-9]+\ fix ]]; then
        FIXES="$FIXES\n- ${line#* }"
    elif [[ ! "$line" =~ ^[a-f0-9]+\ chore:\ bump\ version ]]; then
        OTHER="$OTHER\n- ${line#* }"
    fi
done <<< "$COMMITS"

# Build release notes
NOTES=""
if [ -n "$FEATURES" ]; then
    NOTES="## Features\n$FEATURES\n\n"
fi
if [ -n "$FIXES" ]; then
    NOTES="${NOTES}## Bug Fixes\n$FIXES\n\n"
fi
if [ -n "$OTHER" ] && [ -z "$FEATURES" ] && [ -z "$FIXES" ]; then
    NOTES="${NOTES}## Changes\n$OTHER\n\n"
fi

# Fallback if no categorized commits
if [ -z "$NOTES" ]; then
    NOTES="Release $TAG"
fi

# Create GitHub release
echo "Creating GitHub release..."
echo -e "$NOTES" | gh release create "$TAG" --title "$TAG" --notes-file -

echo ""
echo "Release $TAG created successfully!"
echo "GitHub Actions will now build and upload the artifacts."
echo "Monitor progress at: https://github.com/cloudshipco/mud-client/actions"
