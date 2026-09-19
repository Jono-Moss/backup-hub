#!/bin/sh

# -----------------------------------------------------------------------------
# Build Script
#
# Examples:
#   ./build.sh 3.0.6 myfin/backup-hub
#   ./build.sh 3.0.6 myfin/backup-hub --push
#   ./build.sh 3.0.6 myfin/backup-hub --push --log build.log
# -----------------------------------------------------------------------------

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <version> <repository> [--push] [--log logfile]"
    exit 1
fi

VERSION="$1"
REPO_PATH="$2"

BUILD_NUMBER=${BUILD_NUMBER:-$(date +%s)}
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

REGISTRY_HOST="docker.io"

# -----------------------------------------------------------------------------
# Clean repository name
# -----------------------------------------------------------------------------

CLEAN_REPO=$(printf "%s" "$REPO_PATH" \
    | sed 's|^https\?://||' \
    | sed 's|^/||' \
    | tr '[:upper:]' '[:lower:]')

FULL_REGISTRY="$REGISTRY_HOST/$CLEAN_REPO"

# -----------------------------------------------------------------------------
# Optional arguments
# -----------------------------------------------------------------------------

PUSH=false
LOG_FILE=""

shift 2

while [ $# -gt 0 ]; do
    case "$1" in
        --push)
            PUSH=true
            ;;
        --log)
            LOG_FILE="$2"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
    shift
done

echo "=================================================="
echo "Version            : $VERSION"
echo "Repository         : $FULL_REGISTRY"
echo "Build Number       : $BUILD_NUMBER"
echo "Build Date         : $BUILD_DATE"
echo "Git Commit         : $GIT_COMMIT"
echo "Push               : $PUSH"
[ -n "$LOG_FILE" ] && echo "Log File           : $LOG_FILE"
echo "=================================================="

# -----------------------------------------------------------------------------
# Change to project root
# -----------------------------------------------------------------------------

cd "$(dirname "$0")/.." || exit 1

echo "Building from $(pwd)"

# -----------------------------------------------------------------------------
# Ensure buildx builder exists
# -----------------------------------------------------------------------------

if ! docker buildx inspect multibuilder >/dev/null 2>&1; then
    echo "Creating buildx builder..."
    docker buildx create --name multibuilder --use
    docker buildx inspect --bootstrap
else
    docker buildx use multibuilder >/dev/null
fi

# -----------------------------------------------------------------------------
# Build function
# -----------------------------------------------------------------------------

run_build() {

    if [ "$PUSH" = true ]; then

        docker buildx build \
            --platform linux/amd64,linux/arm64 \
            --push \
            --network=host \
            --progress=plain \
            --build-arg BUILD_VERSION="$VERSION" \
            --build-arg BUILD_NUMBER="$BUILD_NUMBER" \
            --build-arg BUILD_DATE="$BUILD_DATE" \
            --build-arg GIT_COMMIT="$GIT_COMMIT" \
            -f docker/dockerfile \
            -t "$FULL_REGISTRY:$VERSION" \
            -t "$FULL_REGISTRY:latest" \
            .

    else

        docker buildx build \
            --platform linux/amd64 \
            --load \
            --network=host \
            --progress=plain \
            --build-arg BUILD_VERSION="$VERSION" \
            --build-arg BUILD_NUMBER="$BUILD_NUMBER" \
            --build-arg BUILD_DATE="$BUILD_DATE" \
            --build-arg GIT_COMMIT="$GIT_COMMIT" \
            -f docker/dockerfile \
            -t "$FULL_REGISTRY:$VERSION" \
            -t "$FULL_REGISTRY:latest" \
            .

    fi
}

# -----------------------------------------------------------------------------
# Execute build
# -----------------------------------------------------------------------------

if [ -n "$LOG_FILE" ]; then

    run_build 2>&1 | tee "$LOG_FILE"

    if [ -n "$BASH_VERSION" ]; then
        BUILD_RESULT=${PIPESTATUS[0]}
    else
        BUILD_RESULT=$?
    fi

else

    run_build
    BUILD_RESULT=$?

fi

# -----------------------------------------------------------------------------
# Result
# -----------------------------------------------------------------------------

if [ $BUILD_RESULT -ne 0 ]; then
    echo ""
    echo "Build failed!"
    [ -n "$LOG_FILE" ] && echo "See: $LOG_FILE"
    exit 1
fi

echo ""
echo "=================================================="
echo "Build completed successfully."
echo ""

if [ "$PUSH" = true ]; then

    echo "Published:"
    echo "  $FULL_REGISTRY:$VERSION"
    echo "  $FULL_REGISTRY:latest"

else

    echo "Built locally:"
    echo "  $FULL_REGISTRY:$VERSION"
    echo "  $FULL_REGISTRY:latest"
    echo ""
    echo "Run again with --push to publish."

fi

echo "=================================================="
